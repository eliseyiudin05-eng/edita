package editordiscussion

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

func TestGetDiscussionRequiresMembershipAndRemovesAuthorIDs(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/discussion_members":
			if request.URL.Query().Get("topic_key") != "eq.editors-in-cinema" || request.URL.Query().Get("user_id") != "eq."+subject {
				t.Fatalf("membership query is not bounded: %s", request.URL.String())
			}
			return response(`[{"topic_key":"editors-in-cinema","user_id":"` + subject + `"}]`), nil
		case "/rest/v1/discussion_messages":
			if request.URL.Query().Get("topic_key") != "eq.editors-in-cinema" || request.URL.Query().Get("status") != "eq.published" || request.URL.Query().Get("limit") != "80" {
				t.Fatalf("message query is not bounded: %s", request.URL.String())
			}
			return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","topic_key":"editors-in-cinema","author_id":"` + subject + `","content":"Второе","status":"published","created_at":"2026-09-14T01:00:00Z"},{"id":"323e4567-e89b-12d3-a456-426614174003","topic_key":"editors-in-cinema","author_id":"` + subject + `","content":"Первое","status":"published","created_at":"2026-09-14T00:00:00Z"}]`), nil
		case "/rest/v1/public_profiles":
			if request.URL.Query().Get("select") != "id,display_name,username" || !strings.Contains(request.URL.Query().Get("id"), subject) {
				t.Fatalf("unsafe profile query: %s", request.URL.String())
			}
			return response(`[{"id":"` + subject + `","display_name":"Монтажёр","username":"editor"}]`), nil
		default:
			t.Fatalf("unexpected request: %s", request.URL.String())
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetDiscussion(context.Background(), "access-token", subject)
	if err != nil || requests != 3 || len(got.Messages) != 2 || got.Messages[0].Content != "Первое" || got.Messages[0].Author != "Монтажёр" || got.Messages[0].Username == nil || *got.Messages[0].Username != "editor" {
		t.Fatalf("result=%+v requests=%d error=%v", got, requests, err)
	}
}

func TestGetDiscussionRejectsMissingMembershipBeforeReadingMessages(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/rest/v1/discussion_members" {
			t.Fatalf("unexpected request after missing membership: %s", request.URL.Path)
		}
		return response(`[]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetDiscussion(context.Background(), "token", "123e4567-e89b-12d3-a456-426614174001")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error=%v", err)
	}
}

func TestGetDiscussionRejectsUnexpectedTopic(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if requests == 1 {
			return response(`[{"topic_key":"editors-in-cinema","user_id":"` + subject + `"}]`), nil
		}
		return response(`[{"id":"223e4567-e89b-12d3-a456-426614174002","topic_key":"other","author_id":"` + subject + `","content":"Текст","status":"published","created_at":"2026-09-14T00:00:00Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetDiscussion(context.Background(), "token", subject)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error=%v", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
