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

	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
)

func testHandler() http.Handler {
	return New(Options{
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		Environment:  "test",
		Version:      "1.0.3",
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
	if !strings.Contains(body, `"version":"1.0.3"`) {
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
