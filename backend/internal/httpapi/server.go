package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/eliseyiudin05-eng/edita/backend/internal/academy"
	"github.com/eliseyiudin05-eng/edita/backend/internal/aifeedback"
	"github.com/eliseyiudin05-eng/edita/backend/internal/aihistory"
	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
	"github.com/eliseyiudin05-eng/edita/backend/internal/business"
	"github.com/eliseyiudin05-eng/edita/backend/internal/businessdiscussion"
	"github.com/eliseyiudin05-eng/edita/backend/internal/campaigns"
	"github.com/eliseyiudin05-eng/edita/backend/internal/chat"
	"github.com/eliseyiudin05-eng/edita/backend/internal/editordiscussion"
	"github.com/eliseyiudin05-eng/edita/backend/internal/editorverification"
	"github.com/eliseyiudin05-eng/edita/backend/internal/finance"
	"github.com/eliseyiudin05-eng/edita/backend/internal/guardianverification"
	"github.com/eliseyiudin05-eng/edita/backend/internal/plans"
	"github.com/eliseyiudin05-eng/edita/backend/internal/practice"
	"github.com/eliseyiudin05-eng/edita/backend/internal/profile"
	"github.com/eliseyiudin05-eng/edita/backend/internal/rewards"
	"github.com/eliseyiudin05-eng/edita/backend/internal/social"
)

type Pinger interface {
	Ping(context.Context) error
}

type TokenVerifier interface {
	Verify(context.Context, string) (auth.Claims, error)
	Ready(context.Context) error
}

type AuthSessionService interface {
	Register(context.Context, auth.Registration) (string, error)
	Login(context.Context, string, string, string, string) (auth.Session, error)
	Refresh(context.Context, string, string, string) (auth.Session, error)
	Logout(context.Context, string) error
	IssueEmailToken(context.Context, string, string) (auth.EmailChallenge, error)
	ConfirmEmail(context.Context, string) error
	ResetPassword(context.Context, string, string) error
}

type AuthMailer interface {
	SendAuthLink(context.Context, string, string, string) error
}

type LearningPreferencesReader interface {
	GetLearningPreferences(context.Context, string, string) (profile.LearningPreferences, error)
	GetPublicSettings(context.Context, string, string) (profile.PublicSettings, error)
	UpdatePublicSettings(context.Context, string, string, profile.PublicSettings) (profile.PublicSettings, error)
	UpdateLearningPreferences(context.Context, string, string, profile.Preferences) (profile.UpdateLearningPreferencesResponse, error)
}

type AcademyProgressReader interface {
	GetProgress(context.Context, string, string) (academy.Progress, error)
}

type PracticeSessionStore interface {
	GetSession(context.Context, string, string) (practice.ReadResponse, error)
	SaveSession(context.Context, string, string, practice.Session) (practice.SaveResponse, error)
}

type PlanInterestWriter interface {
	SaveInterest(context.Context, string, string, plans.Interest) (plans.Response, error)
}

type AIFeedbackWriter interface {
	SaveFeedback(context.Context, string, string, aifeedback.Feedback) (aifeedback.Response, error)
}

type SocialRankingReader interface {
	GetRanking(context.Context, string, string) (social.Ranking, error)
}

type SocialFriendsReader interface {
	GetFriendships(context.Context, string, string) (social.Friendships, error)
	CancelFriendRequest(context.Context, string, string, string) error
	RespondToFriendRequest(context.Context, string, string, string, string) (social.FriendshipResponse, error)
}

type SocialGroupsReader interface {
	GetGroups(context.Context, string, string) (social.Groups, error)
}

type BusinessVerificationReader interface {
	GetVerification(context.Context, string, string) (business.Verification, error)
}

type BusinessDiscussionStore interface {
	GetDiscussion(context.Context, string, string) (businessdiscussion.Discussion, error)
	CreateMessage(context.Context, string, string, businessdiscussion.CreateMessageInput) (businessdiscussion.CreateMessageResponse, error)
}

type EditorDiscussionStore interface {
	GetDiscussion(context.Context, string, string) (editordiscussion.Discussion, error)
	CreateMessage(context.Context, string, string, editordiscussion.CreateMessageInput) (editordiscussion.CreateMessageResponse, error)
	Enroll(context.Context, string, string) (editordiscussion.EnrollResponse, error)
}

type EditorVerificationReader interface {
	GetVerification(context.Context, string, string) (editorverification.Verification, error)
}

type GuardianVerificationReader interface {
	GetVerification(context.Context, string, string) (guardianverification.Verification, error)
}

type PrivateChatReader interface {
	GetThread(context.Context, string, string, string) (chat.Thread, error)
	ListConversations(context.Context, string, string) (chat.ConversationList, error)
	CreateMessage(context.Context, string, string, chat.CreateMessageInput) (chat.CreateMessageResponse, error)
}

type AIHistoryReader interface {
	GetHistory(context.Context, string, string, string) (aihistory.History, error)
	ClearHistory(context.Context, string, string, string) error
	EnsureConversation(context.Context, string, string, aihistory.EnsureConversationInput) (aihistory.Conversation, error)
}

type FinanceStore interface {
	GetWallet(context.Context, string, string) (finance.Wallet, error)
	ListPayouts(context.Context, string, string) (finance.Payouts, error)
	CreatePayout(context.Context, string, string, int64) error
	StartTopup(context.Context, string, finance.TopupInput) (finance.TopupResponse, error)
	HandlePaymentWebhook(context.Context, string) error
}

type RewardsStore interface {
	GetDashboard(context.Context, string, string, bool) (rewards.Dashboard, error)
	QualifyReferral(context.Context, string, string) (rewards.Qualification, error)
	Redeem(context.Context, string, string, string) (rewards.RedemptionResult, error)
}

type CampaignStore interface {
	Get(context.Context, string, string) (campaigns.View, error)
	Create(context.Context, string, string, campaigns.CreateInput) (campaigns.Campaign, error)
	Apply(context.Context, string, string, campaigns.ApplyInput) error
	SetApplicationStatus(context.Context, string, string, string, string) (string, error)
}

type Options struct {
	Logger                  *slog.Logger
	Environment             string
	Version                 string
	Commit                  string
	MaxBodyBytes            int64
	DependencyTimeout       time.Duration
	Database                Pinger
	Auth                    TokenVerifier
	AuthSessions            AuthSessionService
	AuthMailer              AuthMailer
	Profiles                LearningPreferencesReader
	Academy                 AcademyProgressReader
	Practice                PracticeSessionStore
	Plans                   PlanInterestWriter
	AIFeedback              AIFeedbackWriter
	Social                  SocialRankingReader
	SocialFriends           SocialFriendsReader
	SocialGroups            SocialGroupsReader
	Business                BusinessVerificationReader
	BusinessDiscussion      BusinessDiscussionStore
	EditorDiscussion        EditorDiscussionStore
	EditorVerification      EditorVerificationReader
	GuardianVerification    GuardianVerificationReader
	PrivateChats            PrivateChatReader
	AIHistory               AIHistoryReader
	Finance                 FinanceStore
	Rewards                 RewardsStore
	PointsRedemptionEnabled bool
	Campaigns               CampaignStore
}

type server struct {
	logger                  *slog.Logger
	environment             string
	version                 string
	commit                  string
	maxBodyBytes            int64
	dependencyTimeout       time.Duration
	database                Pinger
	auth                    TokenVerifier
	authSessions            AuthSessionService
	authMailer              AuthMailer
	profiles                LearningPreferencesReader
	academy                 AcademyProgressReader
	practice                PracticeSessionStore
	plans                   PlanInterestWriter
	aiFeedback              AIFeedbackWriter
	social                  SocialRankingReader
	socialFriends           SocialFriendsReader
	socialGroups            SocialGroupsReader
	business                BusinessVerificationReader
	businessDiscussion      BusinessDiscussionStore
	editorDiscussion        EditorDiscussionStore
	editorVerification      EditorVerificationReader
	guardianVerification    GuardianVerificationReader
	privateChats            PrivateChatReader
	aiHistory               AIHistoryReader
	finance                 FinanceStore
	rewards                 RewardsStore
	pointsRedemptionEnabled bool
	campaigns               CampaignStore
}

type contextKey string

const requestIDKey contextKey = "request_id"

type auditState struct {
	authenticated bool
}

func New(options Options) http.Handler {
	logger := options.Logger
	if logger == nil {
		logger = slog.Default()
	}
	if options.MaxBodyBytes <= 0 {
		options.MaxBodyBytes = 1 << 20
	}
	if options.DependencyTimeout <= 0 {
		options.DependencyTimeout = 3 * time.Second
	}

	s := &server{
		logger:                  logger,
		environment:             options.Environment,
		version:                 options.Version,
		commit:                  options.Commit,
		maxBodyBytes:            options.MaxBodyBytes,
		dependencyTimeout:       options.DependencyTimeout,
		database:                options.Database,
		auth:                    options.Auth,
		authSessions:            options.AuthSessions,
		authMailer:              options.AuthMailer,
		profiles:                options.Profiles,
		academy:                 options.Academy,
		practice:                options.Practice,
		plans:                   options.Plans,
		aiFeedback:              options.AIFeedback,
		social:                  options.Social,
		socialFriends:           options.SocialFriends,
		socialGroups:            options.SocialGroups,
		business:                options.Business,
		businessDiscussion:      options.BusinessDiscussion,
		editorDiscussion:        options.EditorDiscussion,
		editorVerification:      options.EditorVerification,
		guardianVerification:    options.GuardianVerification,
		privateChats:            options.PrivateChats,
		aiHistory:               options.AIHistory,
		finance:                 options.Finance,
		rewards:                 options.Rewards,
		pointsRedemptionEnabled: options.PointsRedemptionEnabled,
		campaigns:               options.Campaigns,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/readyz", s.ready)
	mux.HandleFunc("/v1/meta", s.meta)
	mux.HandleFunc("/v1/diagnostics/auth", s.authDiagnostic)
	mux.HandleFunc("/v1/auth/signup", s.authSignup)
	mux.HandleFunc("/v1/auth/login", s.authLogin)
	mux.HandleFunc("/v1/auth/refresh", s.authRefresh)
	mux.HandleFunc("/v1/auth/logout", s.authLogout)
	mux.HandleFunc("/v1/auth/resend-confirmation", s.authResendConfirmation)
	mux.HandleFunc("/v1/auth/recovery", s.authRecovery)
	mux.HandleFunc("/v1/auth/confirm-email", s.authConfirmEmail)
	mux.HandleFunc("/v1/auth/reset-password", s.authResetPassword)
	mux.HandleFunc("/v1/profile/learning-preferences", s.learningPreferences)
	mux.HandleFunc("/v1/profile/settings", s.profileSettings)
	mux.HandleFunc("/v1/academy/progress", s.academyProgress)
	mux.HandleFunc("/v1/practice/session", s.practiceSession)
	mux.HandleFunc("/v1/plans/interest", s.planInterest)
	mux.HandleFunc("/v1/ai/feedback", s.aiFeedbackRoute)
	mux.HandleFunc("/v1/social/ranking", s.socialRanking)
	mux.HandleFunc("/v1/social/friends", s.socialFriendships)
	mux.HandleFunc("/v1/social/friends/cancel", s.socialFriendshipCancel)
	mux.HandleFunc("/v1/social/friends/respond", s.socialFriendshipRespond)
	mux.HandleFunc("/v1/social/groups", s.socialGroupsList)
	mux.HandleFunc("/v1/business/verification", s.businessVerification)
	mux.HandleFunc("/v1/community/business-discussion", s.businessDiscussionList)
	mux.HandleFunc("/v1/community/editor-discussion", s.editorDiscussionList)
	mux.HandleFunc("/v1/community/editor-discussion/enroll", s.editorDiscussionEnroll)
	mux.HandleFunc("/v1/editor/verification", s.editorVerificationStatus)
	mux.HandleFunc("/v1/guardian/verification", s.guardianVerificationStatus)
	mux.HandleFunc("/v1/private-chats/thread", s.privateChatThread)
	mux.HandleFunc("/v1/private-chats", s.privateChatList)
	mux.HandleFunc("/v1/private-chats/message", s.privateChatMessage)
	mux.HandleFunc("/v1/ai/history", s.aiHistoryRoute)
	mux.HandleFunc("/v1/ai/conversations", s.aiConversationEnsure)
	mux.HandleFunc("/v1/finance/wallet", s.financeWallet)
	mux.HandleFunc("/v1/finance/payouts", s.financePayouts)
	mux.HandleFunc("/v1/finance/topups", s.financeTopups)
	mux.HandleFunc("/v1/finance/yookassa/webhook", s.financeWebhook)
	mux.HandleFunc("/v1/social/referrals", s.socialReferrals)
	mux.HandleFunc("/v1/referrals/qualify", s.referralQualify)
	mux.HandleFunc("/v1/marketplace/campaigns", s.marketplaceCampaigns)

	return s.requestID(s.requestAudit(s.recoverPanic(s.securityHeaders(s.limitBody(mux)))))
}

func (s *server) marketplaceCampaigns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if s.campaigns == nil {
		writeError(w, r, http.StatusServiceUnavailable, "campaign_service_unavailable", "Campaigns are temporarily unavailable.")
		return
	}
	token, subject, ok := s.authenticatedIdentity(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	defer cancel()
	if r.Method == http.MethodGet {
		if r.URL.RawQuery != "" {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not supported.")
			return
		}
		result, err := s.campaigns.Get(ctx, token, subject)
		if errors.Is(err, campaigns.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "campaigns_unavailable", "Campaigns could not be loaded.")
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	var body struct {
		Action        string   `json:"action"`
		Title         string   `json:"title"`
		Goal          string   `json:"goal"`
		Requirements  string   `json:"requirements"`
		BudgetText    string   `json:"budgetText"`
		CreatorSlots  int64    `json:"creatorSlots"`
		ContentTypes  []string `json:"contentTypes"`
		EndsAt        *string  `json:"endsAt"`
		CampaignID    string   `json:"campaignId"`
		PortfolioURL  string   `json:"portfolioUrl"`
		Note          string   `json:"note"`
		ApplicationID string   `json:"applicationId"`
		Status        string   `json:"status"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid campaign request is required.")
		return
	}
	switch body.Action {
	case "create":
		input, err := campaigns.NormalizeCreate(campaigns.CreateInput{Title: body.Title, Goal: body.Goal, Requirements: body.Requirements, BudgetText: body.BudgetText, CreatorSlots: body.CreatorSlots, ContentTypes: body.ContentTypes, EndsAt: body.EndsAt})
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_campaign", "Add a valid title, goal, budget and creator count.")
			return
		}
		result, err := s.campaigns.Create(ctx, token, subject, input)
		if errors.Is(err, campaigns.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "verified_business_required", "A verified business account is required.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "campaign_create_failed", "The campaign could not be created.")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "campaign": result})
	case "apply":
		input, err := campaigns.NormalizeApply(campaigns.ApplyInput{CampaignID: body.CampaignID, PortfolioURL: body.PortfolioURL, Note: body.Note})
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_application", "A valid campaign application is required.")
			return
		}
		err = s.campaigns.Apply(ctx, token, subject, input)
		if errors.Is(err, campaigns.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "editor_not_eligible", "Level 2, 300 XP and guardian approval when required are needed.")
			return
		}
		if errors.Is(err, campaigns.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "campaign_not_found", "The open campaign was not found.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "application_failed", "The application could not be saved.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	case "application_status":
		applicationID := strings.ToLower(strings.TrimSpace(body.ApplicationID))
		if !campaigns.ValidStatus(body.Status) {
			writeError(w, r, http.StatusBadRequest, "invalid_status", "The application status is invalid.")
			return
		}
		conversationID, err := s.campaigns.SetApplicationStatus(ctx, token, subject, applicationID, body.Status)
		if errors.Is(err, campaigns.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "application_forbidden", "The application is not owned by this business.")
			return
		}
		if errors.Is(err, campaigns.ErrInvalid) {
			writeError(w, r, http.StatusBadRequest, "invalid_application", "A valid application ID is required.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "application_update_failed", "The application status could not be updated.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "conversationId": nilIfEmpty(conversationID)})
	default:
		writeError(w, r, http.StatusBadRequest, "unknown_action", "Choose a supported campaign action.")
	}
}

func nilIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func (s *server) socialReferrals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if s.rewards == nil {
		writeError(w, r, http.StatusServiceUnavailable, "rewards_service_unavailable", "Rewards are temporarily unavailable.")
		return
	}
	token, subject, ok := s.authenticatedIdentity(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	defer cancel()
	if r.Method == http.MethodGet {
		if r.URL.RawQuery != "" {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not supported.")
			return
		}
		result, err := s.rewards.GetDashboard(ctx, token, subject, s.pointsRedemptionEnabled)
		if errors.Is(err, rewards.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "rewards_unavailable", "Rewards could not be loaded.")
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	if !s.pointsRedemptionEnabled {
		writeError(w, r, http.StatusConflict, "redemption_disabled", "Points redemption will become available with Creator+.")
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	var body struct {
		Reward string `json:"reward"`
	}
	if err := decodeJSON(r, &body); err != nil || !rewards.ValidReward(body.Reward) {
		writeError(w, r, http.StatusBadRequest, "unknown_reward", "The requested reward does not exist.")
		return
	}
	result, err := s.rewards.Redeem(ctx, token, subject, body.Reward)
	switch {
	case errors.Is(err, rewards.ErrInsufficient):
		writeError(w, r, http.StatusConflict, "not_enough_points", "There are not enough KIVRONIX Points.")
	case errors.Is(err, rewards.ErrForbidden):
		writeError(w, r, http.StatusForbidden, "reward_forbidden", "This reward is available to editors only.")
	case errors.Is(err, rewards.ErrNotFound):
		writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
	case err != nil:
		writeError(w, r, http.StatusServiceUnavailable, "redemption_unavailable", "The reward could not be redeemed.")
	default:
		writeJSON(w, http.StatusOK, result)
	}
}

func (s *server) referralQualify(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.rewards == nil {
		writeError(w, r, http.StatusServiceUnavailable, "rewards_service_unavailable", "Rewards are temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not supported.")
		return
	}
	token, subject, ok := s.authenticatedIdentity(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	defer cancel()
	result, err := s.rewards.QualifyReferral(ctx, token, subject)
	if errors.Is(err, rewards.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "qualification_unavailable", "Referral qualification could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) authenticatedIdentity(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	if s.auth == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication is temporarily unavailable.")
		return "", "", false
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return "", "", false
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	cancel()
	if err != nil {
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
		} else {
			writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		}
		return "", "", false
	}
	if claims.Role != "authenticated" {
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return "", "", false
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	return token, claims.Subject, true
}

func (s *server) financeTopups(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	_, subject, ok := s.financeIdentity(w, r)
	if !ok {
		return
	}
	var input finance.TopupInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || !finance.ValidTopup(input) {
		writeError(w, r, http.StatusBadRequest, "invalid_topup", "A valid idempotency ID and 100 to 1,000,000 Points are required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A single valid JSON object is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	result, err := s.finance.StartTopup(ctx, subject, input)
	if errors.Is(err, finance.ErrConflict) {
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "The idempotency ID is already used by another top-up.")
		return
	}
	if errors.Is(err, finance.ErrProvider) {
		writeError(w, r, http.StatusServiceUnavailable, "payment_provider_unavailable", "The payment provider is temporarily unavailable.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "topup_unavailable", "The top-up could not be created.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) financeWebhook(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.finance == nil || r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_notification", "A valid notification is required.")
		return
	}
	var body struct {
		Type   string `json:"type"`
		Event  string `json:"event"`
		Object struct {
			ID string `json:"id"`
		} `json:"object"`
	}
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&body); err != nil || body.Type != "notification" || body.Object.ID == "" {
		writeError(w, r, http.StatusBadRequest, "invalid_notification", "A valid notification is required.")
		return
	}
	if body.Event != "payment.succeeded" {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	if err := s.finance.HandlePaymentWebhook(ctx, body.Object.ID); err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "notification_processing_failed", "The notification could not be processed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) financeWallet(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not accepted.")
		return
	}
	token, subject, ok := s.financeIdentity(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	defer cancel()
	result, err := s.finance.GetWallet(ctx, token, subject)
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "wallet_unavailable", "The Points wallet is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) financePayouts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if r.URL.RawQuery != "" || (r.Method == http.MethodPost && !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json")) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not accepted and writes require a JSON body.")
		return
	}
	token, subject, ok := s.financeIdentity(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	defer cancel()
	if r.Method == http.MethodPost {
		var input struct {
			AmountRub int64 `json:"amountRub"`
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || input.AmountRub > finance.MaximumPayoutCents/100 || !finance.ValidPayoutAmount(input.AmountRub*100) {
			writeError(w, r, http.StatusBadRequest, "invalid_payout_amount", "The minimum payout is 100 RUB.")
			return
		}
		var extra any
		if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A single valid JSON object is required.")
			return
		}
		err := s.finance.CreatePayout(ctx, token, subject, input.AmountRub*100)
		if errors.Is(err, finance.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
			return
		}
		if errors.Is(err, finance.ErrPending) {
			writeError(w, r, http.StatusConflict, "payout_pending", "An active payout request already exists.")
			return
		}
		if errors.Is(err, finance.ErrInsufficient) {
			writeError(w, r, http.StatusConflict, "insufficient_earnings", "The earnings balance is insufficient.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "payout_unavailable", "The payout request could not be created.")
			return
		}
	}
	result, err := s.finance.ListPayouts(ctx, token, subject)
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "payouts_unavailable", "Payout history is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) financeIdentity(w http.ResponseWriter, r *http.Request) (string, string, bool) {
	if s.auth == nil || s.finance == nil {
		writeError(w, r, http.StatusServiceUnavailable, "finance_service_unavailable", "Finance operations are temporarily unavailable.")
		return "", "", false
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return "", "", false
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	cancel()
	if err != nil {
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
		} else {
			writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		}
		return "", "", false
	}
	if claims.Role != "authenticated" {
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return "", "", false
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	return token, claims.Subject, true
}

func (s *server) authSignup(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_unavailable", "Authentication is temporarily unavailable.")
		return
	}
	var body struct {
		Email        string          `json:"email"`
		Password     string          `json:"password"`
		Role         string          `json:"role"`
		DisplayName  string          `json:"displayName"`
		Username     string          `json:"username"`
		Onboarding   json.RawMessage `json:"onboarding"`
		ReferralCode string          `json:"referralCode"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid JSON request is required.")
		return
	}
	userID, err := s.authSessions.Register(r.Context(), auth.Registration{
		Email: body.Email, Password: body.Password, Role: body.Role, DisplayName: body.DisplayName,
		Username: body.Username, Onboarding: body.Onboarding, ReferralCode: body.ReferralCode,
	})
	if errors.Is(err, auth.ErrEmailExists) {
		writeError(w, r, http.StatusConflict, "email_exists", "An account with this email already exists.")
		return
	}
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_signup", "Check the email, password and account type.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "signup_failed", "The account could not be created.")
		return
	}
	challenge, err := s.authSessions.IssueEmailToken(r.Context(), body.Email, "confirm_email")
	if err != nil || challenge.Token == "" || s.authMailer == nil || s.authMailer.SendAuthLink(r.Context(), challenge.Email, challenge.Purpose, challenge.Token) != nil {
		writeError(w, r, http.StatusServiceUnavailable, "confirmation_email_failed", "The account was created, but the confirmation email could not be sent. Request a new link.")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "userId": userID, "confirmationRequired": true})
}

func (s *server) authLogin(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_unavailable", "Authentication is temporarily unavailable.")
		return
	}
	var body struct{ Email, Password string }
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid JSON request is required.")
		return
	}
	session, err := s.authSessions.Login(r.Context(), body.Email, body.Password, r.UserAgent(), clientIP(r))
	if errors.Is(err, auth.ErrEmailUnconfirmed) {
		writeError(w, r, http.StatusForbidden, "email_unconfirmed", "Confirm your email before signing in.")
		return
	}
	if errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, r, http.StatusUnauthorized, "invalid_credentials", "Email or password is incorrect.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "login_failed", "Sign in is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *server) authRefresh(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_unavailable", "Authentication is temporarily unavailable.")
		return
	}
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := decodeJSON(r, &body); err != nil || body.RefreshToken == "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A refresh token is required.")
		return
	}
	session, err := s.authSessions.Refresh(r.Context(), body.RefreshToken, r.UserAgent(), clientIP(r))
	if err != nil {
		writeError(w, r, http.StatusUnauthorized, "invalid_refresh_token", "The refresh token is invalid or expired.")
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *server) authLogout(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_unavailable", "Authentication is temporarily unavailable.")
		return
	}
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := decodeJSON(r, &body); err != nil || body.RefreshToken == "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A refresh token is required.")
		return
	}
	if err := s.authSessions.Logout(r.Context(), body.RefreshToken); err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "logout_failed", "Sign out is temporarily unavailable.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) authResendConfirmation(w http.ResponseWriter, r *http.Request) {
	s.authEmailRequest(w, r, "confirm_email")
}

func (s *server) authRecovery(w http.ResponseWriter, r *http.Request) {
	s.authEmailRequest(w, r, "recover_password")
}

func (s *server) authEmailRequest(w http.ResponseWriter, r *http.Request, purpose string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil || s.authMailer == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_email_unavailable", "Authentication email is temporarily unavailable.")
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid email is required.")
		return
	}
	challenge, err := s.authSessions.IssueEmailToken(r.Context(), body.Email, purpose)
	if err != nil && !errors.Is(err, auth.ErrInvalidCredentials) {
		writeError(w, r, http.StatusServiceUnavailable, "auth_email_unavailable", "Authentication email is temporarily unavailable.")
		return
	}
	if challenge.Token != "" {
		if err := s.authMailer.SendAuthLink(r.Context(), challenge.Email, challenge.Purpose, challenge.Token); err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "auth_email_unavailable", "Authentication email is temporarily unavailable.")
			return
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
}

func (s *server) authConfirmEmail(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_unavailable", "Authentication is temporarily unavailable.")
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Token == "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A confirmation token is required.")
		return
	}
	if err := s.authSessions.ConfirmEmail(r.Context(), body.Token); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_confirmation_token", "The confirmation link is invalid or expired.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *server) authResetPassword(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.authSessions == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_unavailable", "Authentication is temporarily unavailable.")
		return
	}
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A token and new password are required.")
		return
	}
	if err := s.authSessions.ResetPassword(r.Context(), body.Token, body.Password); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_recovery", "The recovery link is invalid, expired, or the password is too short.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *server) profileSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if s.auth == nil || s.profiles == nil {
		writeError(w, r, http.StatusServiceUnavailable, "profile_service_unavailable", "Profile settings are temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || (r.Method == http.MethodPost && !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json")) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required for updates.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var update profile.PublicSettings
	if r.Method == http.MethodPost {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&update); err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Valid profile settings are required.")
			return
		}
		var extra any
		if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Valid profile settings are required.")
			return
		}
		var err error
		update, err = profile.NormalizePublicSettings(update)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Valid profile settings are required.")
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	var result profile.PublicSettings
	if r.Method == http.MethodPost {
		result, err = s.profiles.UpdatePublicSettings(ctx, token, claims.Subject, update)
	} else {
		result, err = s.profiles.GetPublicSettings(ctx, token, claims.Subject)
	}
	cancel()
	if errors.Is(err, profile.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
		return
	}
	if errors.Is(err, profile.ErrConflict) {
		writeError(w, r, http.StatusConflict, "username_unavailable", "The profile username is already in use.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "profile_settings_unavailable", "Profile settings could not be processed.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) aiFeedbackRoute(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.auth == nil || s.aiFeedback == nil {
		writeError(w, r, http.StatusServiceUnavailable, "ai_feedback_service_unavailable", "AI feedback saving is temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var feedback aifeedback.Feedback
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&feedback); err != nil || !aifeedback.ValidFeedback(feedback) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid feedback rating with a short comment is required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid feedback rating with a short comment is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.aiFeedback.SaveFeedback(ctx, token, claims.Subject, feedback)
	cancel()
	if errors.Is(err, aifeedback.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "assistant_message_not_found", "The assistant message was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "ai_feedback_save_unavailable", "AI feedback could not be saved.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) planInterest(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.auth == nil || s.plans == nil {
		writeError(w, r, http.StatusServiceUnavailable, "plan_interest_service_unavailable", "Plan interest saving is temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var interest plans.Interest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&interest); err != nil || !plans.ValidInterest(interest) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid plan interest is required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid plan interest is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.plans.SaveInterest(ctx, token, claims.Subject, interest)
	cancel()
	if errors.Is(err, plans.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
		return
	}
	if errors.Is(err, plans.ErrForbidden) {
		writeError(w, r, http.StatusConflict, "plan_audience_mismatch", "The plan must match the account type.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "plan_interest_save_unavailable", "Plan interest could not be saved.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) practiceSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if s.auth == nil || s.practice == nil {
		writeError(w, r, http.StatusServiceUnavailable, "practice_service_unavailable", "Practice session saving is temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || (r.Method == http.MethodPost && !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json")) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not accepted and writes require a JSON body.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var input practice.Session
	if r.Method == http.MethodPost {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || !practice.ValidSession(input) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid bounded practice session is required.")
			return
		}
		var extra any
		if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid bounded practice session is required.")
			return
		}
		if input.Messages == nil {
			input.Messages = []practice.Message{}
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	if r.Method == http.MethodGet {
		result, err := s.practice.GetSession(ctx, token, claims.Subject)
		cancel()
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "practice_read_unavailable", "The practice session could not be loaded.")
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	result, err := s.practice.SaveSession(ctx, token, claims.Subject, input)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "practice_save_unavailable", "The practice session could not be saved.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) socialFriendshipRespond(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.auth == nil || s.socialFriends == nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_friends_service_unavailable", "Friendship response is temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var input struct {
		ID     string `json:"id"`
		Action string `json:"action"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || !social.ValidRelationID(input.ID) || (input.Action != "accept" && input.Action != "decline") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid relation ID and response action are required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid relation ID and response action are required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.socialFriends.RespondToFriendRequest(ctx, token, claims.Subject, input.ID, input.Action)
	cancel()
	if errors.Is(err, social.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "friendship_not_found", "The friendship request was not found.")
		return
	}
	if errors.Is(err, social.ErrForbidden) {
		writeError(w, r, http.StatusForbidden, "friendship_response_forbidden", "Only the addressee can respond to a pending friendship request.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "friendship_response_unavailable", "The friendship request could not be updated.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) socialFriendshipCancel(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.auth == nil || s.socialFriends == nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_friends_service_unavailable", "Friendship cancellation is temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var input struct {
		ID string `json:"id"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || !social.ValidRelationID(input.ID) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid friendship relation ID is required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid friendship relation ID is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	err = s.socialFriends.CancelFriendRequest(ctx, token, claims.Subject, input.ID)
	cancel()
	if errors.Is(err, social.ErrForbidden) {
		writeError(w, r, http.StatusForbidden, "friendship_cancel_forbidden", "Only the requester can cancel a pending friendship request.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "friendship_cancel_unavailable", "The friendship request could not be cancelled.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) aiConversationEnsure(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if s.auth == nil || s.aiHistory == nil {
		writeError(w, r, http.StatusServiceUnavailable, "ai_history_service_unavailable", "AI history is temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var input aihistory.EnsureConversationInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid conversation payload is required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) || !aihistory.ValidEnsureConversationInput(input) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid conversation payload is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	conversation, err := s.aiHistory.EnsureConversation(ctx, token, claims.Subject, input)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "ai_conversation_unavailable", "AI conversation could not be prepared.")
		return
	}
	writeJSON(w, http.StatusOK, conversation)
}

func (s *server) aiHistoryRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodDelete {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodDelete)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if s.auth == nil || s.aiHistory == nil {
		writeError(w, r, http.StatusServiceUnavailable, "ai_history_service_unavailable", "AI history is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	scopes, present := r.URL.Query()["scope"]
	if !present || len(scopes) != 1 || !aihistory.ValidScope(scopes[0]) || len(r.URL.Query()) != 1 {
		writeError(w, r, http.StatusBadRequest, "invalid_scope", "A valid AI history scope is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	if r.Method == http.MethodDelete {
		err = s.aiHistory.ClearHistory(ctx, token, claims.Subject, scopes[0])
		cancel()
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "ai_history_clear_unavailable", "AI history could not be cleared.")
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	result, err := s.aiHistory.GetHistory(ctx, token, claims.Subject, scopes[0])
	cancel()
	if errors.Is(err, aihistory.ErrNotFound) {
		writeError(w, r, http.StatusNotFound, "ai_history_not_found", "AI history was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "ai_history_service_unavailable", "AI history is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) privateChatList(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.privateChats == nil {
		writeError(w, r, http.StatusServiceUnavailable, "private_chat_service_unavailable", "Private chats are temporarily unavailable.")
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_query", "Query parameters are not supported.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.privateChats.ListConversations(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "private_chat_service_unavailable", "Private chats are temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) privateChatThread(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.privateChats == nil {
		writeError(w, r, http.StatusServiceUnavailable, "private_chat_service_unavailable", "Private chat is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	conversationIDs, present := r.URL.Query()["conversationId"]
	if !present || len(conversationIDs) != 1 || !chat.ValidConversationID(conversationIDs[0]) || len(r.URL.Query()) != 1 {
		writeError(w, r, http.StatusBadRequest, "invalid_conversation", "A valid conversation ID is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.privateChats.GetThread(ctx, token, claims.Subject, conversationIDs[0])
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "private_chat_service_unavailable", "Private chat is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) privateChatMessage(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed and a JSON body is required.")
		return
	}
	if s.auth == nil || s.privateChats == nil {
		writeError(w, r, http.StatusServiceUnavailable, "private_chat_service_unavailable", "Private chat is temporarily unavailable.")
		return
	}
	var input chat.CreateMessageInput
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil || !chat.ValidCreateMessage(input) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid idempotency ID, conversation ID and bounded message are required.")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "A single JSON object is required.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.privateChats.CreateMessage(ctx, token, claims.Subject, input)
	cancel()
	if errors.Is(err, chat.ErrConflict) {
		writeError(w, r, http.StatusConflict, "idempotency_conflict", "The idempotency ID is already used by another message.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "private_chat_write_unavailable", "The private message could not be saved.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) businessVerification(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.business == nil {
		writeError(w, r, http.StatusServiceUnavailable, "business_service_unavailable", "Business verification is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.business.GetVerification(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "business_service_unavailable", "Business verification is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) businessDiscussionList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if r.URL.RawQuery != "" || (r.Method == http.MethodPost && !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json")) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed and writes require a JSON body.")
		return
	}
	if s.auth == nil || s.businessDiscussion == nil {
		writeError(w, r, http.StatusServiceUnavailable, "business_discussion_service_unavailable", "Business discussion is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var input businessdiscussion.CreateMessageInput
	if r.Method == http.MethodPost {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || !businessdiscussion.ValidCreateMessage(input) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid idempotency ID and bounded message are required.")
			return
		}
		var extra any
		if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid idempotency ID and bounded message are required.")
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	if r.Method == http.MethodPost {
		result, err := s.businessDiscussion.CreateMessage(ctx, token, claims.Subject, input)
		cancel()
		if errors.Is(err, businessdiscussion.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "business_role_required", "A business account is required.")
			return
		}
		if errors.Is(err, businessdiscussion.ErrConflict) {
			writeError(w, r, http.StatusConflict, "idempotency_conflict", "The idempotency ID is already used by another message.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "business_discussion_write_unavailable", "The business discussion message could not be saved.")
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	result, err := s.businessDiscussion.GetDiscussion(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		if errors.Is(err, businessdiscussion.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "business_role_required", "A business account is required.")
			return
		}
		writeError(w, r, http.StatusServiceUnavailable, "business_discussion_service_unavailable", "Business discussion is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) editorDiscussionList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if r.URL.RawQuery != "" || (r.Method == http.MethodPost && !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json")) {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed and writes require a JSON body.")
		return
	}
	if s.auth == nil || s.editorDiscussion == nil {
		writeError(w, r, http.StatusServiceUnavailable, "editor_discussion_service_unavailable", "Editor discussion is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var input editordiscussion.CreateMessageInput
	if r.Method == http.MethodPost {
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil || !editordiscussion.ValidCreateMessage(input) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid idempotency ID and bounded message are required.")
			return
		}
		var extra any
		if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A valid idempotency ID and bounded message are required.")
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	if r.Method == http.MethodPost {
		result, err := s.editorDiscussion.CreateMessage(ctx, token, claims.Subject, input)
		cancel()
		if errors.Is(err, editordiscussion.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "discussion_membership_required", "Discussion membership is required.")
			return
		}
		if errors.Is(err, editordiscussion.ErrConflict) {
			writeError(w, r, http.StatusConflict, "idempotency_conflict", "The idempotency ID is already used by another message.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "editor_discussion_write_unavailable", "The editor discussion message could not be saved.")
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	result, err := s.editorDiscussion.GetDiscussion(ctx, token, claims.Subject)
	cancel()
	if errors.Is(err, editordiscussion.ErrForbidden) {
		writeError(w, r, http.StatusForbidden, "discussion_membership_required", "Discussion membership is required.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "editor_discussion_service_unavailable", "Editor discussion is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) editorDiscussionEnroll(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed.")
		return
	}
	if s.auth == nil || s.editorDiscussion == nil {
		writeError(w, r, http.StatusServiceUnavailable, "editor_discussion_service_unavailable", "Editor discussion is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.editorDiscussion.Enroll(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "editor_discussion_enrollment_unavailable", "Editor discussion enrollment is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) editorVerificationStatus(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed.")
		return
	}
	if s.auth == nil || s.editorVerification == nil {
		writeError(w, r, http.StatusServiceUnavailable, "editor_verification_service_unavailable", "Editor verification is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.editorVerification.GetVerification(ctx, token, claims.Subject)
	cancel()
	if errors.Is(err, editorverification.ErrForbidden) {
		writeError(w, r, http.StatusForbidden, "editor_role_required", "The editor role is required.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "editor_verification_service_unavailable", "Editor verification is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) guardianVerificationStatus(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed.")
		return
	}
	if s.auth == nil || s.guardianVerification == nil {
		writeError(w, r, http.StatusServiceUnavailable, "guardian_verification_service_unavailable", "Guardian verification is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.guardianVerification.GetVerification(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "guardian_verification_service_unavailable", "Guardian verification is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) socialGroupsList(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.socialGroups == nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_service_unavailable", "Study groups are temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.socialGroups.GetGroups(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_service_unavailable", "Study groups are temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) socialFriendships(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.socialFriends == nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_service_unavailable", "Friendships are temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.socialFriends.GetFriendships(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_service_unavailable", "Friendships are temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) socialRanking(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.social == nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_service_unavailable", "Social ranking is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.social.GetRanking(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "social_service_unavailable", "Social ranking is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) academyProgress(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil || s.academy == nil {
		writeError(w, r, http.StatusServiceUnavailable, "academy_service_unavailable", "Academy progress is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	result, err := s.academy.GetProgress(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		writeError(w, r, http.StatusServiceUnavailable, "academy_service_unavailable", "Academy progress is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) learningPreferences(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodGet+", "+http.MethodPost)
		writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
		return
	}
	if s.auth == nil || s.profiles == nil {
		writeError(w, r, http.StatusServiceUnavailable, "profile_service_unavailable", "Profile reading is temporarily unavailable.")
		return
	}
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	var update profile.Preferences
	if r.Method == http.MethodPost {
		if r.URL.RawQuery != "" || !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "A JSON body without query parameters is required.")
			return
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&update); err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Valid learning preferences are required.")
			return
		}
		var extra any
		if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
			writeError(w, r, http.StatusBadRequest, "invalid_request", "Valid learning preferences are required.")
			return
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	claims, err := s.auth.Verify(ctx, token)
	if err != nil {
		cancel()
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if claims.Role != "authenticated" {
		cancel()
		writeError(w, r, http.StatusForbidden, "authenticated_role_required", "The authenticated user role is required.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	if r.Method == http.MethodPost {
		result, err := s.profiles.UpdateLearningPreferences(ctx, token, claims.Subject, update)
		cancel()
		if errors.Is(err, profile.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
			return
		}
		if errors.Is(err, profile.ErrForbidden) {
			writeError(w, r, http.StatusForbidden, "editor_profile_required", "Learning preferences are available only to editors.")
			return
		}
		if err != nil {
			writeError(w, r, http.StatusServiceUnavailable, "profile_update_unavailable", "Learning preferences could not be saved.")
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}
	result, err := s.profiles.GetLearningPreferences(ctx, token, claims.Subject)
	cancel()
	if err != nil {
		if errors.Is(err, profile.ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "profile_not_found", "The profile was not found.")
			return
		}
		writeError(w, r, http.StatusServiceUnavailable, "profile_service_unavailable", "Profile reading is temporarily unavailable.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *server) ready(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	dependencies := map[string]string{"database": "not_configured", "jwks": "not_configured"}
	ready := true
	if s.database == nil {
		ready = false
	} else {
		ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
		err := s.database.Ping(ctx)
		cancel()
		if err != nil {
			dependencies["database"] = "unavailable"
			ready = false
		} else {
			dependencies["database"] = "ready"
		}
	}
	if s.auth == nil {
		ready = false
	} else {
		ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
		err := s.auth.Ready(ctx)
		cancel()
		if err != nil {
			dependencies["jwks"] = "unavailable"
			ready = false
		} else {
			dependencies["jwks"] = "ready"
		}
	}
	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{"ok": ready, "dependencies": dependencies})
}

func (s *server) authDiagnostic(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if s.auth == nil {
		writeError(w, r, http.StatusServiceUnavailable, "auth_not_configured", "Authentication diagnostics are not configured.")
		return
	}

	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, r, http.StatusUnauthorized, "authentication_required", "A valid bearer token is required.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.dependencyTimeout)
	_, err := s.auth.Verify(ctx, token)
	cancel()
	if err != nil {
		if errors.Is(err, auth.ErrVerificationService) {
			writeError(w, r, http.StatusServiceUnavailable, "auth_service_unavailable", "Authentication verification is temporarily unavailable.")
			return
		}
		writeError(w, r, http.StatusUnauthorized, "invalid_access_token", "The access token is invalid or expired.")
		return
	}
	if state, ok := r.Context().Value(auditStateKey).(*auditState); ok {
		state.authenticated = true
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "authentication": "verified"})
}

func (s *server) meta(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"service":     "kivronix-go-backend",
		"environment": s.environment,
		"version":     s.version,
		"commit":      s.commit,
	})
}

func (s *server) limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func (s *server) requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := strings.TrimSpace(r.Header.Get("X-Request-ID"))
		if !validRequestID(requestID) {
			requestID = newRequestID()
		}
		w.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, requestID)))
	})
}

const auditStateKey contextKey = "audit_state"

func (s *server) requestAudit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		state := &auditState{}
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		started := time.Now()
		next.ServeHTTP(recorder, r.WithContext(context.WithValue(r.Context(), auditStateKey, state)))
		s.logger.Info("request completed",
			"request_id", requestIDFromContext(r.Context()),
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"response_bytes", recorder.bytes,
			"authenticated", state.authenticated,
			"duration_ms", time.Since(started).Milliseconds(),
		)
	})
}

func (s *server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("request panic", "panic_type", fmt.Sprintf("%T", recovered), "stack", string(debug.Stack()))
				writeError(w, r, http.StatusInternalServerError, "internal_server_error", "An internal error occurred.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeError(w, r, http.StatusMethodNotAllowed, "method_not_allowed", "This HTTP method is not allowed.")
	return false
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{
		"code":       code,
		"message":    message,
		"request_id": requestIDFromContext(r.Context()),
	}})
}

func decodeJSON(r *http.Request, destination any) error {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		return errors.New("JSON content type is required")
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request must contain exactly one JSON value")
	}
	return nil
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return ""
}

func bearerToken(header string) (string, bool) {
	parts := strings.Fields(header)
	returnValue := ""
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && parts[1] != "" {
		returnValue = parts[1]
	}
	return returnValue, returnValue != ""
}

func validRequestID(value string) bool {
	if value == "" || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character == '-' || character == '_' || character == '.' {
			continue
		}
		return false
	}
	return true
}

func requestIDFromContext(ctx context.Context) string {
	requestID, _ := ctx.Value(requestIDKey).(string)
	return requestID
}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	bytes       int
	wroteHeader bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.wroteHeader {
		return
	}
	r.wroteHeader = true
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(value []byte) (int, error) {
	if !r.wroteHeader {
		r.wroteHeader = true
		r.status = http.StatusOK
	}
	written, err := r.ResponseWriter.Write(value)
	r.bytes += written
	return written, err
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func newRequestID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "request-id-unavailable"
	}
	return hex.EncodeToString(value[:])
}
