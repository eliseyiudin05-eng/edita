package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testHandler() http.Handler {
	return New(Options{
		Logger:       slog.New(slog.NewTextHandler(io.Discard, nil)),
		Environment:  "test",
		Version:      "1.0.2",
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
	if !strings.Contains(body, `"version":"1.0.2"`) {
		t.Fatalf("version missing: %s", body)
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
