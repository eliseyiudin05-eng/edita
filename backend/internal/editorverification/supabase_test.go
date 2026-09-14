package editorverification

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }

func TestGetVerificationUsesSelfAuthAndOwnerFilters(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		switch request.URL.Path {
		case "/auth/v1/user":
			return response(`{"id":"` + subject + `","email_confirmed_at":"2026-09-14T00:00:00Z"}`), nil
		case "/rest/v1/profiles":
			if request.URL.Query().Get("id") != "eq."+subject || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe profile query: %s", request.URL.String())
			}
			return response(`[{"id":"` + subject + `","role":"editor","onboarding":{"ageGroup":"16-17"},"guardian_verified":true,"editor_verification_level":"basic"}]`), nil
		case "/rest/v1/editor_verification_requests":
			if request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe request query: %s", request.URL.String())
			}
			return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","user_id":"` + subject + `","portfolio_url":"https://example.com","sample_url":null,"note":"cut","status":"pending","review_note":null,"created_at":"2026-09-14T00:00:00Z","reviewed_at":null}]`), nil
		default:
			t.Fatalf("unexpected path: %s", request.URL.Path)
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetVerification(context.Background(), "access-token", subject)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 3 || !got.EmailVerified || got.AgeGroup != "16-17" || !got.GuardianVerified || got.Request == nil || got.Request.Status != "pending" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestGetVerificationRejectsAnotherAuthUser(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(`{"id":"223e4567-e89b-12d3-a456-426614174002","email_confirmed_at":null}`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetVerification(context.Background(), "token", "123e4567-e89b-12d3-a456-426614174001")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v", err)
	}
}

func TestGetVerificationRejectsNonEditor(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		if requests == 1 {
			return response(`{"id":"` + subject + `","email_confirmed_at":null}`), nil
		}
		return response(`[{"id":"` + subject + `","role":"student","onboarding":{},"guardian_verified":false,"editor_verification_level":null}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetVerification(context.Background(), "token", subject)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
