package guardianverification

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

func TestGetVerificationUsesOwnerFiltersAndOmitsGuardianPII(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/profiles":
			if request.URL.Query().Get("id") != "eq."+subject || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe profile query: %s", request.URL.String())
			}
			return response(`[{"id":"` + subject + `","role":"editor","onboarding":{"ageGroup":"16-17"},"guardian_verified":false}]`), nil
		case "/rest/v1/guardian_verification_requests":
			if request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe request query: %s", request.URL.String())
			}
			if strings.Contains(request.URL.Query().Get("select"), "guardian_email") || strings.Contains(request.URL.Query().Get("select"), "guardian_name") {
				t.Fatalf("PII selected: %s", request.URL.String())
			}
			return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","user_id":"` + subject + `","status":"pending","review_note":null,"created_at":"2026-09-14T00:00:00Z"}]`), nil
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
	if requests != 2 || !got.Needed || got.Verified || got.Request == nil || got.Request.Status != "pending" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestGetVerificationSkipsRequestForAdult(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/rest/v1/profiles" {
			t.Fatalf("unexpected request: %s", request.URL.Path)
		}
		return response(`[{"id":"` + subject + `","role":"editor","onboarding":{"ageGroup":"18+"},"guardian_verified":false}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetVerification(context.Background(), "token", subject)
	if err != nil || got.Needed || got.Request != nil {
		t.Fatalf("result=%+v error=%v", got, err)
	}
}

func TestGetVerificationRejectsAnotherOwner(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path == "/rest/v1/profiles" {
			return response(`[{"id":"` + subject + `","role":"editor","onboarding":{"ageGroup":"16-17"},"guardian_verified":false}]`), nil
		}
		return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","user_id":"323e4567-e89b-12d3-a456-426614174003","status":"pending","review_note":null,"created_at":"2026-09-14T00:00:00Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetVerification(context.Background(), "token", subject)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
