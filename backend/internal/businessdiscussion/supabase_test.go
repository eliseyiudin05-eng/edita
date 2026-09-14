package businessdiscussion

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

func TestGetDiscussionRequiresBusinessAndReturnsChronologicalMessagesWithoutAuthorIDs(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/profiles":
			if request.URL.Query().Get("id") != "eq."+subject || request.URL.Query().Get("select") != "id,role" {
				t.Fatalf("unsafe profile query: %s", request.URL.String())
			}
			return response(`[{"id":"` + subject + `","role":"business"}]`), nil
		case "/rest/v1/business_discussion_messages":
			if request.URL.Query().Get("topic_key") != "eq.company-growth" || request.URL.Query().Get("status") != "eq.published" || request.URL.Query().Get("limit") != "80" {
				t.Fatalf("unsafe message query: %s", request.URL.String())
			}
			return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","topic_key":"company-growth","author_id":"` + subject + `","content":"Второе","status":"published","created_at":"2026-09-14T01:00:00Z"},{"id":"323e4567-e89b-12d3-a456-426614174003","topic_key":"company-growth","author_id":"` + subject + `","content":"Первое","status":"published","created_at":"2026-09-14T00:00:00Z"}]`), nil
		case "/rest/v1/public_profiles":
			if !strings.Contains(request.URL.Query().Get("id"), subject) || request.URL.Query().Get("select") != "id,display_name" {
				t.Fatalf("unsafe public profile query: %s", request.URL.String())
			}
			return response(`[{"id":"` + subject + `","display_name":"Компания"}]`), nil
		default:
			t.Fatalf("unexpected path: %s", request.URL.Path)
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetDiscussion(context.Background(), "access-token", subject)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Messages) != 2 || got.Messages[0].Content != "Первое" || got.Messages[1].Content != "Второе" || got.Messages[0].Author != "Компания" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestGetDiscussionRejectsNonBusinessProfile(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return response(`[{"id":"` + subject + `","role":"editor"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetDiscussion(context.Background(), "token", subject)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v", err)
	}
}

func TestGetDiscussionRejectsUnexpectedTopic(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path == "/rest/v1/profiles" {
			return response(`[{"id":"` + subject + `","role":"business"}]`), nil
		}
		return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","topic_key":"other-topic","author_id":"` + subject + `","content":"Текст","status":"published","created_at":"2026-09-14T00:00:00Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetDiscussion(context.Background(), "token", subject)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
