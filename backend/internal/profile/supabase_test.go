package profile

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

func TestGetLearningPreferencesUsesTokenAndSubjectFilter(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/rest/v1/profiles" || request.URL.Query().Get("id") != "eq.user-id" {
			t.Fatalf("unexpected URL: %s", request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatalf("authentication headers missing")
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"user-id","role":"editor","onboarding":{"level":"new","software":"CapCut","goal":"freelance","private":"not-returned"}}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetLearningPreferences(context.Background(), "access-token", "user-id")
	if err != nil {
		t.Fatal(err)
	}
	if got.Role != "editor" || got.Preferences.Level != "new" || got.Preferences.Software != "CapCut" || got.Preferences.Goal != "freelance" {
		t.Fatalf("unexpected preferences: %+v", got)
	}
}

func TestGetLearningPreferencesRejectsUnexpectedIdentity(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"other-user","role":"editor","onboarding":{}}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := client.GetLearningPreferences(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestGetLearningPreferencesMapsEmptyRLSResultToNotFound(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := client.GetLearningPreferences(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

func TestGetLearningPreferencesDoesNotFollowRedirects(t *testing.T) {
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		return &http.Response{
			StatusCode: http.StatusFound,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     http.Header{"Location": []string{"https://unexpected.example/profiles"}},
		}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := client.GetLearningPreferences(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, redirect was followed", requests)
	}
}
