package business

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

func TestGetVerificationUsesTokenAndOwnerChain(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const businessID = "223e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatalf("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/businesses":
			if request.URL.Query().Get("owner_id") != "eq."+subject || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe business query: %s", request.URL.String())
			}
			return response(`[{"id":"` + businessID + `","owner_id":"` + subject + `","name":"KIVRONIX","verified":false,"verification_status":"pending","verification_level":"verified_company","verification_note":null,"verified_at":null}]`), nil
		case "/rest/v1/business_verification_requests":
			if request.URL.Query().Get("business_id") != "eq."+businessID || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe request query: %s", request.URL.String())
			}
			return response(`[{"id":"323e4567-e89b-12d3-a456-426614174003","business_id":"` + businessID + `","requested_level":"verified_company","status":"pending","review_note":null,"created_at":"2026-09-13T22:00:00Z"}]`), nil
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
	if requests != 2 || got.Business.Name != "KIVRONIX" || got.Request == nil || got.Request.Status != "pending" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestGetVerificationRejectsBusinessOwnedByAnotherSubject(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","owner_id":"423e4567-e89b-12d3-a456-426614174004","name":"Other","verified":false,"verification_status":"pending","verification_level":"verified_company","verification_note":null,"verified_at":null}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetVerification(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174001")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestGetVerificationRejectsRequestForAnotherBusiness(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		if requests == 1 {
			return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","owner_id":"` + subject + `","name":"Mine","verified":false,"verification_status":"pending","verification_level":"verified_company","verification_note":null,"verified_at":null}]`), nil
		}
		return response(`[{"id":"323e4567-e89b-12d3-a456-426614174003","business_id":"423e4567-e89b-12d3-a456-426614174004","requested_level":"verified_company","status":"pending","review_note":null,"created_at":"2026-09-13T22:00:00Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetVerification(context.Background(), "access-token", subject)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
