package aihistory

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

func TestGetHistoryUsesOwnerFiltersAndUserToken(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const conversation = "223e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatalf("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/ai_conversations":
			if request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("scope_key") != "eq.lesson:cutting" || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe conversation query: %s", request.URL.String())
			}
			return response(`[{"id":"` + conversation + `","user_id":"` + subject + `","scope_key":"lesson:cutting","title":"Монтаж","lesson_slug":"cutting","updated_at":"2026-09-14T00:00:00Z"}]`), nil
		case "/rest/v1/ai_messages":
			query := request.URL.Query()
			if query.Get("conversation_id") != "eq."+conversation || query.Get("user_id") != "eq."+subject || query.Get("order") != "created_at.asc,id.asc" || query.Get("limit") != "80" {
				t.Fatalf("unsafe message query: %s", request.URL.String())
			}
			return response(`[{"id":"323e4567-e89b-12d3-a456-426614174003","conversation_id":"` + conversation + `","user_id":"` + subject + `","role":"assistant","content":"Ответ","created_at":"2026-09-14T00:00:01Z"}]`), nil
		default:
			t.Fatalf("unexpected path: %s", request.URL.Path)
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetHistory(context.Background(), "access-token", subject, "lesson:cutting")
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || got.Conversation.ID != conversation || len(got.Messages) != 1 || got.Messages[0].From != "ai" || got.Messages[0].Text != "Ответ" {
		t.Fatalf("unexpected history: %+v", got)
	}
}

func TestGetHistoryRejectsUnexpectedMessageOwner(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const conversation = "223e4567-e89b-12d3-a456-426614174002"
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path == "/rest/v1/ai_conversations" {
			return response(`[{"id":"` + conversation + `","user_id":"` + subject + `","scope_key":"main","title":"Помощник","lesson_slug":null,"updated_at":"2026-09-14T00:00:00Z"}]`), nil
		}
		return response(`[{"id":"323e4567-e89b-12d3-a456-426614174003","conversation_id":"` + conversation + `","user_id":"423e4567-e89b-12d3-a456-426614174004","role":"user","content":"Чужое","created_at":"2026-09-14T00:00:01Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetHistory(context.Background(), "access-token", subject, "main"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestClearHistoryUsesOwnerFiltersAndUserToken(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const conversation = "223e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatalf("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/ai_conversations":
			if request.Method != http.MethodGet || request.URL.Query().Get("select") != "id,user_id,scope_key" || request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("scope_key") != "eq.main" || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe conversation lookup: %s %s", request.Method, request.URL.String())
			}
			return response(`[{"id":"` + conversation + `","user_id":"` + subject + `","scope_key":"main"}]`), nil
		case "/rest/v1/ai_messages":
			if request.Method != http.MethodDelete || request.URL.Query().Get("conversation_id") != "eq."+conversation || request.URL.Query().Get("user_id") != "eq."+subject || request.Header.Get("Prefer") != "return=minimal" {
				t.Fatalf("unsafe message delete: %s %s", request.Method, request.URL.String())
			}
			return &http.Response{StatusCode: http.StatusNoContent, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
		default:
			t.Fatalf("unexpected path: %s", request.URL.Path)
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}

	if err := client.ClearHistory(context.Background(), "access-token", subject, "main"); err != nil {
		t.Fatal(err)
	}
	if requests != 2 {
		t.Fatalf("requests = %d, want 2", requests)
	}
}

func TestClearHistoryIsIdempotentWhenConversationIsMissing(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet || request.URL.Path != "/rest/v1/ai_conversations" {
			t.Fatalf("unexpected request: %s %s", request.Method, request.URL.String())
		}
		return response(`[]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.ClearHistory(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174001", "main"); err != nil {
		t.Fatal(err)
	}
}

func TestEnsureConversationCreatesWithOwnerTokenAndBoundedFields(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const conversation = "223e4567-e89b-12d3-a456-426614174002"
	requests := 0
	lesson := "cutting"
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		if requests == 1 {
			if request.Method != http.MethodGet || request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("scope_key") != "eq.lesson:cutting" || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe lookup: %s %s", request.Method, request.URL.String())
			}
			return response(`[]`), nil
		}
		if request.Method != http.MethodPost || request.Header.Get("Content-Type") != "application/json" || request.Header.Get("Prefer") != "return=representation" || request.URL.Query().Get("select") != "id,user_id,scope_key,title,lesson_slug,updated_at" {
			t.Fatalf("unsafe insert: %s %s", request.Method, request.URL.String())
		}
		body, _ := io.ReadAll(request.Body)
		if !strings.Contains(string(body), `"user_id":"`+subject+`"`) || !strings.Contains(string(body), `"scope_key":"lesson:cutting"`) {
			t.Fatalf("unsafe insert body: %s", body)
		}
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader(`[{"id":"` + conversation + `","user_id":"` + subject + `","scope_key":"lesson:cutting","title":"Монтаж","lesson_slug":"cutting","updated_at":"2026-09-14T00:00:00Z"}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.EnsureConversation(context.Background(), "access-token", subject, EnsureConversationInput{ScopeKey: "lesson:cutting", Title: "Монтаж", LessonSlug: &lesson})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || got.ID != conversation || got.ScopeKey != "lesson:cutting" || got.Title != "Монтаж" {
		t.Fatalf("unexpected conversation: %+v", got)
	}
}

func TestEnsureConversationRejectsInvalidInputWithoutRequest(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("request should not be sent")
		return nil, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.EnsureConversation(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174001", EnsureConversationInput{ScopeKey: "main", Title: ""}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
