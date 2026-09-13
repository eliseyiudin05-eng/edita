package academy

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

func TestGetProgressUsesTokenSubjectAndRLSQuery(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		query := request.URL.Query()
		if request.URL.Path != "/rest/v1/lesson_progress" || query.Get("user_id") != "eq.user-id" || query.Get("status") != "eq.completed" || query.Get("limit") != "501" {
			t.Fatalf("unexpected URL: %s", request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		body := `[{"user_id":"user-id","status":"completed","lesson":{"slug":"second","xp_reward":150}},{"user_id":"user-id","status":"completed","lesson":{"slug":"first","xp_reward":100}}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetProgress(context.Background(), "access-token", "user-id")
	if err != nil {
		t.Fatal(err)
	}
	if got.XP != 250 || len(got.CompletedSlugs) != 2 || got.CompletedSlugs[0] != "first" || got.CompletedSlugs[1] != "second" {
		t.Fatalf("unexpected progress: %+v", got)
	}
}

func TestGetProgressRejectsUnexpectedIdentity(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `[{"user_id":"other-user","status":"completed","lesson":{"slug":"first","xp_reward":100}}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetProgress(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestGetProgressRejectsDuplicateLesson(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `[{"user_id":"user-id","status":"completed","lesson":{"slug":"first","xp_reward":100}},{"user_id":"user-id","status":"completed","lesson":{"slug":"first","xp_reward":100}}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetProgress(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestGetProgressDoesNotFollowRedirects(t *testing.T) {
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		return &http.Response{StatusCode: http.StatusFound, Body: io.NopCloser(strings.NewReader("")), Header: http.Header{"Location": []string{"https://unexpected.example/progress"}}}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetProgress(context.Background(), "access-token", "user-id"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, redirect was followed", requests)
	}
}
