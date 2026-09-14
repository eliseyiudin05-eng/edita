package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/eliseyiudin05-eng/edita/backend/internal/academy"
	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
	"github.com/eliseyiudin05-eng/edita/backend/internal/business"
	"github.com/eliseyiudin05-eng/edita/backend/internal/chat"
	"github.com/eliseyiudin05-eng/edita/backend/internal/profile"
	"github.com/eliseyiudin05-eng/edita/backend/internal/social"
)

func testHandler() http.Handler {
	return New(Options{
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		Environment:  "test",
		Version:      "1.0.17",
		Commit:       "test-commit",
		MaxBodyBytes: 1024,
	})
}

func TestHealth(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()
	testHandler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("security headers missing: %v", response.Header())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload["ok"] != true {
		t.Fatalf("unexpected body: %s", response.Body.String())
	}
}

func TestMetaDoesNotExposeSecrets(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/v1/meta", nil)
	response := httptest.NewRecorder()
	testHandler().ServeHTTP(response, request)

	body := response.Body.String()
	for _, forbidden := range []string{"token", "password", "secret"} {
		if strings.Contains(strings.ToLower(body), forbidden) {
			t.Fatalf("response contains forbidden field %q: %s", forbidden, body)
		}
	}
	if !strings.Contains(body, `"version":"1.0.17"`) {
		t.Fatalf("version missing: %s", body)
	}
}

type fakePinger struct{ err error }

func (p fakePinger) Ping(context.Context) error { return p.err }

type fakeVerifier struct{ err error }

func (v fakeVerifier) Verify(context.Context, string) (auth.Claims, error) {
	return auth.Claims{Subject: "private-user-id"}, v.err
}

func (v fakeVerifier) Ready(context.Context) error { return v.err }

type claimsVerifier struct {
	claims auth.Claims
	err    error
}

func (v claimsVerifier) Verify(context.Context, string) (auth.Claims, error) { return v.claims, v.err }
func (v claimsVerifier) Ready(context.Context) error                         { return v.err }

type fakeProfileReader struct {
	result  profile.LearningPreferences
	err     error
	token   string
	subject string
}

type fakeAcademyReader struct {
	result  academy.Progress
	err     error
	token   string
	subject string
}

type fakeSocialReader struct {
	result  social.Ranking
	err     error
	token   string
	subject string
}

type fakeSocialFriendsReader struct {
	result  social.Friendships
	err     error
	token   string
	subject string
}

type fakeSocialGroupsReader struct {
	result  social.Groups
	err     error
	token   string
	subject string
}

type fakeBusinessReader struct {
	result  business.Verification
	err     error
	token   string
	subject string
}

type fakePrivateChatReader struct {
	result         chat.Thread
	err            error
	token          string
	subject        string
	conversationID string
}

func (reader *fakePrivateChatReader) GetThread(_ context.Context, token, subject, conversationID string) (chat.Thread, error) {
	reader.token = token
	reader.subject = subject
	reader.conversationID = conversationID
	return reader.result, reader.err
}

func (reader *fakeBusinessReader) GetVerification(_ context.Context, token, subject string) (business.Verification, error) {
	reader.token = token
	reader.subject = subject
	return reader.result, reader.err
}

func (reader *fakeSocialGroupsReader) GetGroups(_ context.Context, token, subject string) (social.Groups, error) {
	reader.token = token
	reader.subject = subject
	return reader.result, reader.err
}

func (reader *fakeSocialFriendsReader) GetFriendships(_ context.Context, token, subject string) (social.Friendships, error) {
	reader.token = token
	reader.subject = subject
	return reader.result, reader.err
}

func (reader *fakeSocialReader) GetRanking(_ context.Context, token, subject string) (social.Ranking, error) {
	reader.token = token
	reader.subject = subject
	return reader.result, reader.err
}

func (reader *fakeAcademyReader) GetProgress(_ context.Context, token, subject string) (academy.Progress, error) {
	reader.token = token
	reader.subject = subject
	return reader.result, reader.err
}

func (reader *fakeProfileReader) GetLearningPreferences(_ context.Context, token, subject string) (profile.LearningPreferences, error) {
	reader.token = token
	reader.subject = subject
	return reader.result, reader.err
}

func TestLearningPreferencesRequiresAuthAndReadsVerifiedSubject(t *testing.T) {
	reader := &fakeProfileReader{result: profile.LearningPreferences{
		Role:        "editor",
		Preferences: profile.Preferences{Level: "new", Software: "CapCut", Goal: "freelance"},
	}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "authenticated"}},
		Profiles:          reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/profile/learning-preferences", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/profile/learning-preferences?user_id=other", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "private-user-id" {
		t.Fatalf("unexpected response or reader arguments: status=%d token=%q subject=%q body=%s", response.Code, reader.token, reader.subject, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "private-user-id") {
		t.Fatalf("response exposes identity: %s", response.Body.String())
	}
}

func TestLearningPreferencesRejectsNonAuthenticatedRole(t *testing.T) {
	reader := &fakeProfileReader{}
	handler := New(Options{
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:     claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "anon"}},
		Profiles: reader,
	})
	request := httptest.NewRequest(http.MethodGet, "/v1/profile/learning-preferences", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || reader.subject != "" {
		t.Fatalf("unexpected response: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAcademyProgressRequiresAuthAndReadsVerifiedSubject(t *testing.T) {
	reader := &fakeAcademyReader{result: academy.Progress{CompletedSlugs: []string{"first"}, XP: 100}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "authenticated"}},
		Academy:           reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/academy/progress", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/academy/progress?user_id=other", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "private-user-id" {
		t.Fatalf("unexpected response or reader arguments: status=%d token=%q subject=%q body=%s", response.Code, reader.token, reader.subject, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "private-user-id") {
		t.Fatalf("response exposes identity: %s", response.Body.String())
	}
}

func TestAcademyProgressRejectsNonAuthenticatedRole(t *testing.T) {
	reader := &fakeAcademyReader{}
	handler := New(Options{
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:    claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "anon"}},
		Academy: reader,
	})
	request := httptest.NewRequest(http.MethodGet, "/v1/academy/progress", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || reader.subject != "" {
		t.Fatalf("unexpected response: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestSocialRankingRequiresAuthAndForwardsOnlyVerifiedToken(t *testing.T) {
	reader := &fakeSocialReader{result: social.Ranking{Ranking: []social.RankRow{{
		Level: 2, XP: 300, RatingPoints: 1200, Viewer: true,
	}}}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "authenticated"}},
		Social:            reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/social/ranking", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/social/ranking?user_id=other", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "private-user-id" {
		t.Fatalf("unexpected response or reader token: status=%d token=%q body=%s", response.Code, reader.token, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "private-user-id") {
		t.Fatalf("response exposes verified identity: %s", response.Body.String())
	}
}

func TestSocialFriendshipsRequiresAuthAndForwardsOnlyVerifiedToken(t *testing.T) {
	reader := &fakeSocialFriendsReader{result: social.Friendships{Relations: []social.FriendRelation{{
		ID: "323e4567-e89b-12d3-a456-426614174002", Status: "accepted", Direction: "outgoing", CreatedAt: "2026-09-13T22:00:00Z",
	}}}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "authenticated"}},
		SocialFriends:     reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/social/friends", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/social/friends?user_id=other", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "private-user-id" {
		t.Fatalf("unexpected response or reader token: status=%d token=%q subject=%q body=%s", response.Code, reader.token, reader.subject, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "private-user-id") || strings.Contains(response.Body.String(), "requester_id") || strings.Contains(response.Body.String(), "addressee_id") {
		t.Fatalf("response exposes participant identity: %s", response.Body.String())
	}
}

func TestSocialGroupsRequiresAuthAndForwardsOnlyVerifiedToken(t *testing.T) {
	reader := &fakeSocialGroupsReader{result: social.Groups{Groups: []social.StudyGroup{{
		ID: "323e4567-e89b-12d3-a456-426614174002", Name: "Editors", AgeScope: "18+", JoinCode: "ABC123", MaxMembers: 10, CreatedAt: "2026-09-13T22:00:00Z", Members: []social.GroupMember{},
	}}}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "authenticated"}},
		SocialGroups:      reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/social/groups", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/social/groups?user_id=other", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "private-user-id" {
		t.Fatalf("unexpected response or reader token: status=%d token=%q subject=%q body=%s", response.Code, reader.token, reader.subject, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "private-user-id") || strings.Contains(response.Body.String(), "owner_id") {
		t.Fatalf("response exposes verified owner identity: %s", response.Body.String())
	}
}

func TestBusinessVerificationRequiresAuthAndOmitsInternalIdentifiers(t *testing.T) {
	reader := &fakeBusinessReader{result: business.Verification{
		Business: business.BusinessProfile{Name: "KIVRONIX", VerificationStatus: "pending", VerificationLevel: "verified_company"},
		Request:  &business.VerificationRequest{RequestedLevel: "verified_company", Status: "pending", CreatedAt: "2026-09-13T22:00:00Z"},
	}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "private-user-id", Role: "authenticated"}},
		Business:          reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/business/verification", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/business/verification?owner_id=other", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "private-user-id" {
		t.Fatalf("unexpected response or reader arguments: status=%d token=%q subject=%q body=%s", response.Code, reader.token, reader.subject, response.Body.String())
	}
	for _, forbidden := range []string{"private-user-id", "owner_id", "business_id", `"id"`, "inn", "registration_number", "document_paths"} {
		if strings.Contains(response.Body.String(), forbidden) {
			t.Fatalf("response exposes internal or verification data %q: %s", forbidden, response.Body.String())
		}
	}
}

func TestPrivateChatThreadRequiresAuthAndConversationID(t *testing.T) {
	const conversationID = "323e4567-e89b-12d3-a456-426614174003"
	reader := &fakePrivateChatReader{result: chat.Thread{
		ViewerID: "123e4567-e89b-12d3-a456-426614174001",
		Conversation: chat.Conversation{
			ID: conversationID, EditorID: "223e4567-e89b-12d3-a456-426614174002",
			BusinessOwnerID: "123e4567-e89b-12d3-a456-426614174001", Status: "active",
			CompanyName: "KIVRONIX", Title: "Job", SourceKind: "job",
		},
		Messages: []chat.Message{},
	}}
	handler := New(Options{
		Logger:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:              claimsVerifier{claims: auth.Claims{Subject: "123e4567-e89b-12d3-a456-426614174001", Role: "authenticated"}},
		PrivateChats:      reader,
		DependencyTimeout: time.Second,
	})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/private-chats/thread?conversationId="+conversationID, nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d", unauthorized.Code)
	}

	invalid := httptest.NewRecorder()
	invalidRequest := httptest.NewRequest(http.MethodGet, "/v1/private-chats/thread?conversationId="+conversationID+"&owner_id=other", nil)
	invalidRequest.Header.Set("Authorization", "Bearer signed.token.value")
	handler.ServeHTTP(invalid, invalidRequest)
	if invalid.Code != http.StatusBadRequest {
		t.Fatalf("invalid query status = %d", invalid.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/private-chats/thread?conversationId="+conversationID, nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || reader.token != "signed.token.value" || reader.subject != "123e4567-e89b-12d3-a456-426614174001" || reader.conversationID != conversationID {
		t.Fatalf("unexpected response or reader arguments: status=%d token=%q subject=%q conversation=%q body=%s", response.Code, reader.token, reader.subject, reader.conversationID, response.Body.String())
	}
}

func TestReadinessChecksDependencies(t *testing.T) {
	tests := []struct {
		name       string
		database   Pinger
		verifier   TokenVerifier
		wantStatus int
		wantOK     bool
	}{
		{name: "ready", database: fakePinger{}, verifier: fakeVerifier{}, wantStatus: http.StatusOK, wantOK: true},
		{name: "database unavailable", database: fakePinger{err: errors.New("down")}, verifier: fakeVerifier{}, wantStatus: http.StatusServiceUnavailable},
		{name: "not configured", wantStatus: http.StatusServiceUnavailable},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := New(Options{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: test.database, Auth: test.verifier, DependencyTimeout: time.Second})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", response.Code, test.wantStatus, response.Body.String())
			}
			var payload struct {
				OK bool `json:"ok"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.OK != test.wantOK {
				t.Fatalf("unexpected body: %s", response.Body.String())
			}
		})
	}
}

func TestAuthDiagnosticRequiresAndVerifiesBearerToken(t *testing.T) {
	handler := New(Options{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Auth: fakeVerifier{}})

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/diagnostics/auth", nil))
	if unauthorized.Code != http.StatusUnauthorized || !strings.Contains(unauthorized.Body.String(), `"code":"authentication_required"`) {
		t.Fatalf("unexpected unauthorized response: status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/diagnostics/auth", nil)
	request.Header.Set("Authorization", "Bearer signed.token.value")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "private-user-id") {
		t.Fatalf("unexpected verified response: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAuditLogDoesNotContainBearerToken(t *testing.T) {
	var logs bytes.Buffer
	handler := New(Options{Logger: slog.New(slog.NewJSONHandler(&logs, nil)), Auth: fakeVerifier{}})
	request := httptest.NewRequest(http.MethodGet, "/v1/diagnostics/auth?secret=query", nil)
	request.Header.Set("Authorization", "Bearer do-not-log-this-token")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	logOutput := logs.String()
	if strings.Contains(logOutput, "do-not-log-this-token") || strings.Contains(logOutput, "secret=query") || strings.Contains(logOutput, "private-user-id") {
		t.Fatalf("audit log contains sensitive data: %s", logOutput)
	}
	for _, expected := range []string{`"status":200`, `"authenticated":true`, `"path":"/v1/diagnostics/auth"`} {
		if !strings.Contains(logOutput, expected) {
			t.Fatalf("audit log missing %s: %s", expected, logOutput)
		}
	}
}

func TestErrorsUseCommonShapeAndSafeRequestID(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	request.Header.Set("X-Request-ID", "unsafe\nlog-entry")
	response := httptest.NewRecorder()
	testHandler().ServeHTTP(response, request)

	var payload struct {
		Error struct {
			Code      string `json:"code"`
			RequestID string `json:"request_id"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Error.Code != "method_not_allowed" || payload.Error.RequestID == "" || strings.Contains(payload.Error.RequestID, "\n") {
		t.Fatalf("unexpected error payload: %+v", payload)
	}
}

func TestMethodIsRestricted(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/healthz", strings.NewReader("{}"))
	response := httptest.NewRecorder()
	testHandler().ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != http.MethodGet {
		t.Fatalf("unexpected response: status=%d allow=%q", response.Code, response.Header().Get("Allow"))
	}
}
