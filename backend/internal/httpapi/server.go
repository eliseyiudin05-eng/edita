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
	"github.com/eliseyiudin05-eng/edita/backend/internal/chat"
	"github.com/eliseyiudin05-eng/edita/backend/internal/editorverification"
	"github.com/eliseyiudin05-eng/edita/backend/internal/guardianverification"
	"github.com/eliseyiudin05-eng/edita/backend/internal/plans"
	"github.com/eliseyiudin05-eng/edita/backend/internal/practice"
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

type BusinessDiscussionReader interface {
	GetDiscussion(context.Context, string, string) (businessdiscussion.Discussion, error)
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
}

type AIHistoryReader interface {
	GetHistory(context.Context, string, string, string) (aihistory.History, error)
	ClearHistory(context.Context, string, string, string) error
	EnsureConversation(context.Context, string, string, aihistory.EnsureConversationInput) (aihistory.Conversation, error)
}

type Options struct {
	Logger               *slog.Logger
	Environment          string
	Version              string
	Commit               string
	MaxBodyBytes         int64
	DependencyTimeout    time.Duration
	Database             Pinger
	Auth                 TokenVerifier
	Profiles             LearningPreferencesReader
	Academy              AcademyProgressReader
	Practice             PracticeSessionStore
	Plans                PlanInterestWriter
	AIFeedback           AIFeedbackWriter
	Social               SocialRankingReader
	SocialFriends        SocialFriendsReader
	SocialGroups         SocialGroupsReader
	Business             BusinessVerificationReader
	BusinessDiscussion   BusinessDiscussionReader
	EditorVerification   EditorVerificationReader
	GuardianVerification GuardianVerificationReader
	PrivateChats         PrivateChatReader
	AIHistory            AIHistoryReader
}

type server struct {
	logger               *slog.Logger
	environment          string
	version              string
	commit               string
	maxBodyBytes         int64
	dependencyTimeout    time.Duration
	database             Pinger
	auth                 TokenVerifier
	profiles             LearningPreferencesReader
	academy              AcademyProgressReader
	practice             PracticeSessionStore
	plans                PlanInterestWriter
	aiFeedback           AIFeedbackWriter
	social               SocialRankingReader
	socialFriends        SocialFriendsReader
	socialGroups         SocialGroupsReader
	business             BusinessVerificationReader
	businessDiscussion   BusinessDiscussionReader
	editorVerification   EditorVerificationReader
	guardianVerification GuardianVerificationReader
	privateChats         PrivateChatReader
	aiHistory            AIHistoryReader
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
		logger:               logger,
		environment:          options.Environment,
		version:              options.Version,
		commit:               options.Commit,
		maxBodyBytes:         options.MaxBodyBytes,
		dependencyTimeout:    options.DependencyTimeout,
		database:             options.Database,
		auth:                 options.Auth,
		profiles:             options.Profiles,
		academy:              options.Academy,
		practice:             options.Practice,
		plans:                options.Plans,
		aiFeedback:           options.AIFeedback,
		social:               options.Social,
		socialFriends:        options.SocialFriends,
		socialGroups:         options.SocialGroups,
		business:             options.Business,
		businessDiscussion:   options.BusinessDiscussion,
		editorVerification:   options.EditorVerification,
		guardianVerification: options.GuardianVerification,
		privateChats:         options.PrivateChats,
		aiHistory:            options.AIHistory,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/readyz", s.ready)
	mux.HandleFunc("/v1/meta", s.meta)
	mux.HandleFunc("/v1/diagnostics/auth", s.authDiagnostic)
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
	mux.HandleFunc("/v1/editor/verification", s.editorVerificationStatus)
	mux.HandleFunc("/v1/guardian/verification", s.guardianVerificationStatus)
	mux.HandleFunc("/v1/private-chats/thread", s.privateChatThread)
	mux.HandleFunc("/v1/private-chats", s.privateChatList)
	mux.HandleFunc("/v1/ai/history", s.aiHistoryRoute)
	mux.HandleFunc("/v1/ai/conversations", s.aiConversationEnsure)

	return s.requestID(s.requestAudit(s.recoverPanic(s.securityHeaders(s.limitBody(mux)))))
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
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if r.URL.RawQuery != "" {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Query parameters are not allowed.")
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
