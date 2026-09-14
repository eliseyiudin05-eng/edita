package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/eliseyiudin05-eng/edita/backend/internal/academy"
	"github.com/eliseyiudin05-eng/edita/backend/internal/aifeedback"
	"github.com/eliseyiudin05-eng/edita/backend/internal/aihistory"
	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
	"github.com/eliseyiudin05-eng/edita/backend/internal/business"
	"github.com/eliseyiudin05-eng/edita/backend/internal/businessdiscussion"
	"github.com/eliseyiudin05-eng/edita/backend/internal/campaigns"
	"github.com/eliseyiudin05-eng/edita/backend/internal/chat"
	"github.com/eliseyiudin05-eng/edita/backend/internal/config"
	"github.com/eliseyiudin05-eng/edita/backend/internal/database"
	"github.com/eliseyiudin05-eng/edita/backend/internal/editordiscussion"
	"github.com/eliseyiudin05-eng/edita/backend/internal/editorverification"
	"github.com/eliseyiudin05-eng/edita/backend/internal/finance"
	"github.com/eliseyiudin05-eng/edita/backend/internal/guardianverification"
	"github.com/eliseyiudin05-eng/edita/backend/internal/httpapi"
	"github.com/eliseyiudin05-eng/edita/backend/internal/jobs"
	"github.com/eliseyiudin05-eng/edita/backend/internal/mailer"
	"github.com/eliseyiudin05-eng/edita/backend/internal/plans"
	"github.com/eliseyiudin05-eng/edita/backend/internal/practice"
	"github.com/eliseyiudin05-eng/edita/backend/internal/profile"
	"github.com/eliseyiudin05-eng/edita/backend/internal/rewards"
	"github.com/eliseyiudin05-eng/edita/backend/internal/social"
)

var (
	version = "2.0.0-alpha.14"
	commit  = "local"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	if err := cfg.Validate(); err != nil {
		logger.Error("invalid backend configuration", "error", err)
		os.Exit(1)
	}

	var databasePool *database.Pool
	var databasePinger httpapi.Pinger
	if cfg.DatabaseURL != "" {
		var err error
		databasePool, err = database.Open(context.Background(), cfg.DatabaseURL, cfg.DatabaseMaxConns, cfg.Environment == "production")
		if err != nil {
			logger.Error("database pool configuration failed", "error", err)
			os.Exit(1)
		}
		defer databasePool.Close()
		databasePinger = databasePool
	}

	var tokenVerifier *auth.Verifier
	var authVerifier httpapi.TokenVerifier
	var authSessions httpapi.AuthSessionService
	var authMailer httpapi.AuthMailer
	if databasePool != nil && cfg.AuthSecret != "" {
		localAuth, err := auth.NewService(databasePool.DB(), cfg.AuthIssuer, cfg.AuthAudience, []byte(cfg.AuthSecret), cfg.AuthAccessTTL, cfg.AuthRefreshTTL)
		if err != nil {
			logger.Error("local authentication configuration failed", "error", err)
			os.Exit(1)
		}
		authVerifier = localAuth
		authSessions = localAuth
		if cfg.ResendAPIKey != "" {
			authMailer, err = mailer.NewResend(cfg.ResendAPIKey, cfg.ResendFrom, cfg.PublicSiteURL, &http.Client{Timeout: cfg.EmailHTTPTimeout})
			if err != nil {
				logger.Error("authentication mailer configuration failed", "error", err)
				os.Exit(1)
			}
		}
	} else if cfg.JWKSURL != "" {
		var err error
		tokenVerifier, err = auth.NewVerifier(
			cfg.JWTIssuer,
			cfg.JWTAudience,
			cfg.JWKSURL,
			&http.Client{Timeout: cfg.JWKSHTTPTimeout},
			cfg.JWKSCacheTTL,
		)
		if err != nil {
			logger.Error("JWT verifier configuration failed", "error", err)
			os.Exit(1)
		}
		authVerifier = tokenVerifier
	}

	var profileReader httpapi.LearningPreferencesReader
	var academyReader httpapi.AcademyProgressReader
	var practiceStore httpapi.PracticeSessionStore
	var planInterestWriter httpapi.PlanInterestWriter
	var aiFeedbackWriter httpapi.AIFeedbackWriter
	var socialReader httpapi.SocialRankingReader
	var socialFriendsReader httpapi.SocialFriendsReader
	var socialGroupsReader httpapi.SocialGroupsReader
	var businessReader httpapi.BusinessVerificationReader
	var businessDiscussionReader httpapi.BusinessDiscussionStore
	var editorDiscussionReader httpapi.EditorDiscussionStore
	var editorVerificationReader httpapi.EditorVerificationReader
	var guardianVerificationReader httpapi.GuardianVerificationReader
	var privateChatReader httpapi.PrivateChatReader
	var aiHistoryReader httpapi.AIHistoryReader
	var financeStore httpapi.FinanceStore
	var rewardsStore httpapi.RewardsStore
	var campaignStore httpapi.CampaignStore
	var jobStore httpapi.JobStore
	if databasePool != nil {
		profileReader = profile.NewPostgresRepository(databasePool.DB())
		academyReader = academy.NewPostgresRepository(databasePool.DB())
		practiceStore = practice.NewPostgresRepository(databasePool.DB())
		planInterestWriter = plans.NewPostgresRepository(databasePool.DB())
		aiFeedbackWriter = aifeedback.NewPostgresRepository(databasePool.DB())
		aiHistoryReader = aihistory.NewPostgresRepository(databasePool.DB())
		socialRepository := social.NewPostgresRepository(databasePool.DB())
		socialReader = socialRepository
		socialFriendsReader = socialRepository
		socialGroupsReader = socialRepository
		businessReader = business.NewPostgresRepository(databasePool.DB())
		editorVerificationReader = editorverification.NewPostgresRepository(databasePool.DB())
		guardianVerificationReader = guardianverification.NewPostgresRepository(databasePool.DB())
		businessDiscussionReader = businessdiscussion.NewPostgresRepository(databasePool.DB())
		editorDiscussionReader = editordiscussion.NewPostgresRepository(databasePool.DB())
		privateChatReader = chat.NewPostgresRepository(databasePool.DB())
		financeRepository := finance.NewPostgresRepository(databasePool.DB())
		var paymentProvider finance.PaymentProvider
		if cfg.YooKassaShopID != "" {
			provider, providerErr := finance.NewYooKassa(cfg.YooKassaShopID, cfg.YooKassaSecretKey, &http.Client{Timeout: cfg.PaymentHTTPTimeout})
			if providerErr != nil {
				logger.Error("payment provider configuration failed", "error", providerErr)
				os.Exit(1)
			}
			paymentProvider = provider
		}
		service, serviceErr := finance.NewService(financeRepository, paymentProvider, cfg.PublicSiteURL+"/platform#wallet")
		if serviceErr != nil {
			logger.Error("finance service configuration failed", "error", serviceErr)
			os.Exit(1)
		}
		financeStore = service
		rewardsStore = rewards.NewPostgresRepository(databasePool.DB())
		campaignStore = campaigns.NewPostgresRepository(databasePool.DB())
		jobStore = jobs.NewPostgresRepository(databasePool.DB())
	}
	if cfg.SupabaseURL != "" && cfg.SupabasePublishableKey != "" {
		client, err := profile.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.ProfileHTTPTimeout},
		)
		if err != nil {
			logger.Error("profile client configuration failed", "error", err)
			os.Exit(1)
		}
		if profileReader == nil {
			profileReader = client
		}

		academyClient, err := academy.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.AcademyHTTPTimeout},
		)
		if err != nil {
			logger.Error("academy client configuration failed", "error", err)
			os.Exit(1)
		}
		if academyReader == nil {
			academyReader = academyClient
		}

		practiceClient, err := practice.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.AcademyHTTPTimeout},
		)
		if err != nil {
			logger.Error("practice client configuration failed", "error", err)
			os.Exit(1)
		}
		if practiceStore == nil {
			practiceStore = practiceClient
		}

		plansClient, err := plans.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.ProfileHTTPTimeout},
		)
		if err != nil {
			logger.Error("plan interest client configuration failed", "error", err)
			os.Exit(1)
		}
		if planInterestWriter == nil {
			planInterestWriter = plansClient
		}

		aiFeedbackClient, err := aifeedback.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.AIHistoryHTTPTimeout},
		)
		if err != nil {
			logger.Error("AI feedback client configuration failed", "error", err)
			os.Exit(1)
		}
		if aiFeedbackWriter == nil {
			aiFeedbackWriter = aiFeedbackClient
		}

		socialClient, err := social.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.SocialHTTPTimeout},
		)
		if err != nil {
			logger.Error("social client configuration failed", "error", err)
			os.Exit(1)
		}
		if socialReader == nil {
			socialReader = socialClient
			socialFriendsReader = socialClient
			socialGroupsReader = socialClient
		}

		businessClient, err := business.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.BusinessHTTPTimeout},
		)
		if err != nil {
			logger.Error("business client configuration failed", "error", err)
			os.Exit(1)
		}
		if businessReader == nil {
			businessReader = businessClient
		}

		businessDiscussionClient, err := businessdiscussion.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.BusinessHTTPTimeout},
		)
		if err != nil {
			logger.Error("business discussion client configuration failed", "error", err)
			os.Exit(1)
		}
		if businessDiscussionReader == nil {
			businessDiscussionReader = businessDiscussionClient
		}

		editorDiscussionClient, err := editordiscussion.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.BusinessHTTPTimeout},
		)
		if err != nil {
			logger.Error("editor discussion client configuration failed", "error", err)
			os.Exit(1)
		}
		if editorDiscussionReader == nil {
			editorDiscussionReader = editorDiscussionClient
		}

		editorVerificationClient, err := editorverification.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.BusinessHTTPTimeout},
		)
		if err != nil {
			logger.Error("editor verification client configuration failed", "error", err)
			os.Exit(1)
		}
		if editorVerificationReader == nil {
			editorVerificationReader = editorVerificationClient
		}

		guardianVerificationClient, err := guardianverification.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.BusinessHTTPTimeout},
		)
		if err != nil {
			logger.Error("guardian verification client configuration failed", "error", err)
			os.Exit(1)
		}
		if guardianVerificationReader == nil {
			guardianVerificationReader = guardianVerificationClient
		}

		privateChatClient, err := chat.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.PrivateChatHTTPTimeout},
		)
		if err != nil {
			logger.Error("private chat client configuration failed", "error", err)
			os.Exit(1)
		}
		if privateChatReader == nil {
			privateChatReader = privateChatClient
		}

		aiHistoryClient, err := aihistory.NewClient(
			cfg.SupabaseURL,
			cfg.SupabasePublishableKey,
			&http.Client{Timeout: cfg.AIHistoryHTTPTimeout},
		)
		if err != nil {
			logger.Error("AI history client configuration failed", "error", err)
			os.Exit(1)
		}
		if aiHistoryReader == nil {
			aiHistoryReader = aiHistoryClient
		}
	}

	server := &http.Server{
		Addr: cfg.Address,
		Handler: httpapi.New(httpapi.Options{
			Logger: logger, Environment: cfg.Environment, Version: version, Commit: commit,
			MaxBodyBytes: cfg.MaxBodyBytes, DependencyTimeout: cfg.DependencyTimeout,
			Database: databasePinger, Auth: authVerifier, AuthSessions: authSessions, AuthMailer: authMailer, Profiles: profileReader, Academy: academyReader, Practice: practiceStore, Plans: planInterestWriter, AIFeedback: aiFeedbackWriter, Social: socialReader, SocialFriends: socialFriendsReader, SocialGroups: socialGroupsReader, Business: businessReader, BusinessDiscussion: businessDiscussionReader, EditorDiscussion: editorDiscussionReader, EditorVerification: editorVerificationReader, GuardianVerification: guardianVerificationReader, PrivateChats: privateChatReader, AIHistory: aiHistoryReader, Finance: financeStore, Rewards: rewardsStore, PointsRedemptionEnabled: cfg.PointsRedemptionEnabled, Campaigns: campaignStore, Jobs: jobStore,
		}),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	shutdownSignals, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("go backend listening", "address", cfg.Address, "environment", cfg.Environment, "version", version, "commit", commit)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("go backend stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	case <-shutdownSignals.Done():
		logger.Info("go backend shutdown started")
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("go backend graceful shutdown failed", "error", err)
		_ = server.Close()
		os.Exit(1)
	}

	select {
	case err := <-serverErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("go backend shutdown returned an error", "error", err)
			os.Exit(1)
		}
	case <-time.After(100 * time.Millisecond):
	}
	logger.Info("go backend stopped")
}
