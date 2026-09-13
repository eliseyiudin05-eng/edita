package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"time"

	"github.com/eliseyiudin05-eng/edita/backend/internal/academy"
	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
	"github.com/eliseyiudin05-eng/edita/backend/internal/profile"
	"github.com/eliseyiudin05-eng/edita/backend/internal/social"
)

type Pinger interface {
	Ping(context.Context) error
}

type TokenVerifier interface {
	Verify(context.Context, string) (auth.Claims, error)
	Ready(context.Context) error
}

type LearningPreferencesReader interface {
	GetLearningPreferences(context.Context, string, string) (profile.LearningPreferences, error)
}

type AcademyProgressReader interface {
	GetProgress(context.Context, string, string) (academy.Progress, error)
}

type SocialRankingReader interface {
	GetRanking(context.Context, string, string) (social.Ranking, error)
}

type Options struct {
	Logger            *slog.Logger
	Environment       string
	Version           string
	Commit            string
	MaxBodyBytes      int64
	DependencyTimeout time.Duration
	Database          Pinger
	Auth              TokenVerifier
	Profiles          LearningPreferencesReader
	Academy           AcademyProgressReader
	Social            SocialRankingReader
}

type server struct {
	logger            *slog.Logger
	environment       string
	version           string
	commit            string
	maxBodyBytes      int64
	dependencyTimeout time.Duration
	database          Pinger
	auth              TokenVerifier
	profiles          LearningPreferencesReader
	academy           AcademyProgressReader
	social            SocialRankingReader
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
		logger:            logger,
		environment:       options.Environment,
		version:           options.Version,
		commit:            options.Commit,
		maxBodyBytes:      options.MaxBodyBytes,
		dependencyTimeout: options.DependencyTimeout,
		database:          options.Database,
		auth:              options.Auth,
		profiles:          options.Profiles,
		academy:           options.Academy,
		social:            options.Social,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/readyz", s.ready)
	mux.HandleFunc("/v1/meta", s.meta)
	mux.HandleFunc("/v1/diagnostics/auth", s.authDiagnostic)
	mux.HandleFunc("/v1/profile/learning-preferences", s.learningPreferences)
	mux.HandleFunc("/v1/academy/progress", s.academyProgress)
	mux.HandleFunc("/v1/social/ranking", s.socialRanking)

	return s.requestID(s.requestAudit(s.recoverPanic(s.securityHeaders(s.limitBody(mux)))))
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
	if !requireMethod(w, r, http.MethodGet) {
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
