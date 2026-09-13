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

	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
	"github.com/eliseyiudin05-eng/edita/backend/internal/config"
	"github.com/eliseyiudin05-eng/edita/backend/internal/database"
	"github.com/eliseyiudin05-eng/edita/backend/internal/httpapi"
	"github.com/eliseyiudin05-eng/edita/backend/internal/profile"
)

var (
	version = "1.0.5"
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
	if cfg.JWKSURL != "" {
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
		profileReader = client
	}

	server := &http.Server{
		Addr: cfg.Address,
		Handler: httpapi.New(httpapi.Options{
			Logger: logger, Environment: cfg.Environment, Version: version, Commit: commit,
			MaxBodyBytes: cfg.MaxBodyBytes, DependencyTimeout: cfg.DependencyTimeout,
			Database: databasePinger, Auth: authVerifier, Profiles: profileReader,
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
