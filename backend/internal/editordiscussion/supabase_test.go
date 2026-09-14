package editordiscussion

import (
	"context"
	"encoding/json"
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

func TestCreateMessageUsesUserJWTMembershipAndFixedBoundary(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const messageID = "223e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("user authentication headers missing")
		}
		if requests == 1 {
			if request.URL.Path != "/rest/v1/discussion_members" || request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("topic_key") != "eq.editors-in-cinema" {
				t.Fatalf("membership query is not bounded: %s", request.URL.String())
			}
			return response(`[{"topic_key":"editors-in-cinema","user_id":"` + subject + `"}]`), nil
		}
		if request.Method != http.MethodPost || request.URL.Path != "/rest/v1/discussion_messages" || request.URL.Query().Get("on_conflict") != "id" {
			t.Fatalf("unsafe create request: %s %s", request.Method, request.URL.String())
		}
		if request.Header.Get("Prefer") != "resolution=ignore-duplicates,return=representation" {
			t.Fatalf("missing idempotent preference: %q", request.Header.Get("Prefer"))
		}
		body, _ := io.ReadAll(request.Body)
		var payload messageRow
		if json.Unmarshal(body, &payload) != nil || payload.ID != messageID || payload.AuthorID != subject || payload.TopicKey != topic || payload.Status != "published" || payload.Content != "Текст" {
			t.Fatalf("unsafe payload: %s", body)
		}
		return response(`[{"id":"` + messageID + `","topic_key":"editors-in-cinema","author_id":"` + subject + `","content":"Текст","status":"published","created_at":"2026-09-14T00:00:00Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.CreateMessage(context.Background(), "access-token", subject, CreateMessageInput{ID: messageID, Content: "Текст"})
	if err != nil || !got.OK || requests != 2 {
		t.Fatalf("result=%+v requests=%d error=%v", got, requests, err)
	}
}

func TestCreateMessageRejectsMissingMembershipBeforeInsert(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet || request.URL.Path != "/rest/v1/discussion_members" {
			t.Fatalf("unexpected request after missing membership: %s %s", request.Method, request.URL.Path)
		}
		return response(`[]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreateMessage(context.Background(), "token", "123e4567-e89b-12d3-a456-426614174001", CreateMessageInput{ID: "223e4567-e89b-12d3-a456-426614174002", Content: "Текст"})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("error=%v", err)
	}
}

func TestCreateMessageVerifiesExistingRowAndRejectsConflict(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const messageID = "223e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "key", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		switch requests {
		case 1:
			return response(`[{"topic_key":"editors-in-cinema","user_id":"` + subject + `"}]`), nil
		case 2:
			return response(`[]`), nil
		default:
			if request.Method != http.MethodGet || request.URL.Query().Get("id") != "eq."+messageID {
				t.Fatalf("retry verification is not ID-scoped: %s %s", request.Method, request.URL.String())
			}
			return response(`[{"id":"` + messageID + `","topic_key":"editors-in-cinema","author_id":"` + subject + `","content":"Другой текст","status":"published","created_at":"2026-09-14T00:00:00Z"}]`), nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.CreateMessage(context.Background(), "token", subject, CreateMessageInput{ID: messageID, Content: "Текст"})
	if !errors.Is(err, ErrConflict) || requests != 3 {
		t.Fatalf("requests=%d error=%v", requests, err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
