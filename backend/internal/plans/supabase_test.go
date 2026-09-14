package plans

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }

func TestSaveInterestUsesVerifiedOwnerAndUserJWT(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174000"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("user authentication headers missing")
		}
		if requests == 1 {
			if request.Method != http.MethodGet || request.URL.Path != "/rest/v1/profiles" || request.URL.Query().Get("id") != "eq."+subject {
				t.Fatalf("profile lookup is not owner-scoped: %s %s", request.Method, request.URL.String())
			}
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"` + subject + `","role":"editor"}]`)), Header: make(http.Header)}, nil
		}
		if request.Method != http.MethodPost || request.URL.Path != "/rest/v1/future_plan_interest" || request.URL.Query().Get("on_conflict") != "user_id" {
			t.Fatalf("unexpected upsert: %s %s", request.Method, request.URL.String())
		}
		body, _ := io.ReadAll(request.Body)
		var payload map[string]string
		if json.Unmarshal(body, &payload) != nil || payload["user_id"] != subject || payload["audience"] != "editor" || payload["wanted_plan"] != "creator_plus" {
			t.Fatalf("unexpected payload: %s", body)
		}
		responseBody := `[{"user_id":"` + subject + `","audience":"editor","wanted_plan":"creator_plus"}]`
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader(responseBody)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.SaveInterest(context.Background(), "access-token", subject, Interest{Audience: "editor", Plan: "creator_plus"})
	if err != nil || !got.OK || got.Audience != "editor" || got.Plan != "creator_plus" || got.PaymentsEnabled || requests != 2 {
		t.Fatalf("result=%+v requests=%d error=%v", got, requests, err)
	}
}

func TestSaveInterestRejectsRoleMismatchBeforeWrite(t *testing.T) {
	writes := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet {
			writes++
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"123e4567-e89b-12d3-a456-426614174000","role":"business"}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.SaveInterest(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000", Interest{Audience: "editor", Plan: "creator_plus"}); err != ErrForbidden || writes != 0 {
		t.Fatalf("error=%v writes=%d", err, writes)
	}
}

func TestSaveInterestRejectsUnexpectedReturnedOwner(t *testing.T) {
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if requests == 1 {
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"123e4567-e89b-12d3-a456-426614174000","role":"editor"}]`)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader(`[{"user_id":"223e4567-e89b-12d3-a456-426614174001","audience":"editor","wanted_plan":"creator_plus"}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.SaveInterest(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000", Interest{Audience: "editor", Plan: "creator_plus"}); err == nil {
		t.Fatal("unexpected returned owner accepted")
	}
}
