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

func TestGetPublicSettingsUsesOwnerFilterAndOmitsIdentity(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet || request.URL.Query().Get("id") != "eq.user-id" || request.URL.Query().Get("limit") != "1" {
			t.Fatalf("unexpected owner query: %s %s", request.Method, request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		body := `[{"id":"user-id","display_name":"Elisey","username":"elisey","school_name":"RUDN","avatar_url":"https://example.test/avatar.webp","show_school_publicly":true}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetPublicSettings(context.Background(), "access-token", "user-id")
	if err != nil || got.DisplayName != "Elisey" || got.Username != "elisey" || got.SchoolName != "RUDN" || !got.ShowSchoolPublicly {
		t.Fatalf("settings=%+v error=%v", got, err)
	}
}

func TestGetPublicSettingsRejectsUnexpectedIdentity(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"other-user"}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetPublicSettings(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error=%v, want ErrUnavailable", err)
	}
}

func TestUpdatePublicSettingsUsesOwnerFilterAndReturnsVerifiedSettings(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPatch || request.URL.Query().Get("id") != "eq.user-id" || request.URL.Query().Get("select") == "" {
			t.Fatalf("unexpected update request: %s %s", request.Method, request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" || request.Header.Get("Prefer") != "return=representation" {
			t.Fatal("update authentication or representation headers missing")
		}
		body, _ := io.ReadAll(request.Body)
		for _, expected := range []string{`"display_name":"Elisey Iudin"`, `"username":"elisey"`, `"school_name":"RUDN"`, `"show_school_publicly":true`} {
			if !strings.Contains(string(body), expected) {
				t.Fatalf("update body %s does not contain %s", body, expected)
			}
		}
		responseBody := `[{"id":"user-id","display_name":"Elisey Iudin","username":"elisey","school_name":"RUDN","avatar_url":"https://project.supabase.co/storage/avatar.webp?v=1","show_school_publicly":true}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(responseBody)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	input := PublicSettings{DisplayName: "  Elisey  Iudin ", Username: "@ELISEY", SchoolName: " RUDN ", AvatarURL: "https://project.supabase.co/storage/avatar.webp?v=1", ShowSchoolPublicly: true}
	got, err := client.UpdatePublicSettings(context.Background(), "access-token", "user-id", input)
	if err != nil || got.DisplayName != "Elisey Iudin" || got.Username != "elisey" || !got.ShowSchoolPublicly {
		t.Fatalf("settings=%+v error=%v", got, err)
	}
}

func TestUpdatePublicSettingsRejectsMismatchedOrUnsafeResponse(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `[{"id":"other-user","display_name":"Elisey","username":"elisey","school_name":null,"avatar_url":null,"show_school_publicly":false}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	input := PublicSettings{DisplayName: "Elisey", Username: "elisey"}
	if _, err := client.UpdatePublicSettings(context.Background(), "access-token", "user-id", input); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error=%v, want ErrUnavailable", err)
	}
	if _, err := NormalizePublicSettings(PublicSettings{DisplayName: "Elisey", Username: "elisey", AvatarURL: "http://unsafe.test/avatar"}); err == nil {
		t.Fatal("unsafe avatar URL was accepted")
	}
}

func TestUpdatePublicSettingsMapsUsernameConflict(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusConflict, Body: io.NopCloser(strings.NewReader(`{"code":"23505"}`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.UpdatePublicSettings(context.Background(), "access-token", "user-id", PublicSettings{DisplayName: "Elisey", Username: "elisey"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("error=%v, want ErrConflict", err)
	}
}

func TestUpdateLearningPreferencesPreservesOnboardingAndUsesOwnerFilter(t *testing.T) {
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.URL.Query().Get("id") != "eq.user-id" || request.Header.Get("Authorization") != "Bearer access-token" {
			t.Fatalf("owner filter or authentication missing: %s", request.URL.String())
		}
		if requests == 1 {
			if request.Method != http.MethodGet {
				t.Fatalf("method = %s, want GET", request.Method)
			}
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"user-id","role":"editor","onboarding":{"ageGroup":"18+","level":"new"}}]`)), Header: make(http.Header)}, nil
		}
		if request.Method != http.MethodPatch || request.Header.Get("Prefer") != "return=representation" {
			t.Fatalf("unexpected update request: method=%s headers=%v", request.Method, request.Header)
		}
		body, _ := io.ReadAll(request.Body)
		for _, expected := range []string{`"ageGroup":"18+"`, `"level":"pro"`, `"software":"Resolve"`, `"goal":"work"`} {
			if !strings.Contains(string(body), expected) {
				t.Fatalf("update body %s does not contain %s", body, expected)
			}
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"user-id","onboarding":{"ageGroup":"18+","level":"pro","software":"Resolve","goal":"work"}}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.UpdateLearningPreferences(context.Background(), "access-token", "user-id", Preferences{Level: "pro", Software: "Resolve", Goal: "work"})
	if err != nil || !got.OK || got.Onboarding["ageGroup"] != "18+" || requests != 2 {
		t.Fatalf("result=%+v requests=%d error=%v", got, requests, err)
	}
}

func TestUpdateLearningPreferencesRejectsNonEditor(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"user-id","role":"business","onboarding":{}}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.UpdateLearningPreferences(context.Background(), "access-token", "user-id", Preferences{}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}
