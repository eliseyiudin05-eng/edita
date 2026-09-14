package chat

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

func TestGetThreadUsesParticipantFiltersAndUserToken(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const editor = "223e4567-e89b-12d3-a456-426614174002"
	const conversation = "323e4567-e89b-12d3-a456-426614174003"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatalf("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/private_conversations":
			if request.URL.Query().Get("id") != "eq."+conversation || request.URL.Query().Get("or") != "(editor_id.eq."+subject+",business_owner_id.eq."+subject+")" || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unsafe conversation query: %s", request.URL.String())
			}
			return response(`[{"id":"` + conversation + `","editor_id":"` + editor + `","business_owner_id":"` + subject + `","status":"active","company_name":"KIVRONIX","title":"Job","source_kind":"job"}]`), nil
		case "/rest/v1/private_messages":
			if request.URL.Query().Get("conversation_id") != "eq."+conversation || request.URL.Query().Get("order") != "created_at.asc,id.asc" || request.URL.Query().Get("limit") != "200" {
				t.Fatalf("unsafe message query: %s", request.URL.String())
			}
			return response(`[{"id":"423e4567-e89b-12d3-a456-426614174004","conversation_id":"` + conversation + `","sender_id":"` + editor + `","body":"Hello","created_at":"2026-09-13T23:00:00Z"}]`), nil
		default:
			t.Fatalf("unexpected path: %s", request.URL.Path)
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetThread(context.Background(), "access-token", subject, conversation)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || got.ViewerID != subject || len(got.Messages) != 1 || got.Messages[0].Body != "Hello" {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestGetThreadRejectsConversationOutsideSubject(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(`[{"id":"323e4567-e89b-12d3-a456-426614174003","editor_id":"223e4567-e89b-12d3-a456-426614174002","business_owner_id":"423e4567-e89b-12d3-a456-426614174004","status":"active","company_name":"Other","title":"Job","source_kind":"job"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetThread(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174001", "323e4567-e89b-12d3-a456-426614174003")
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestGetThreadRejectsMessageFromNonParticipant(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174001"
	const conversation = "323e4567-e89b-12d3-a456-426614174003"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		if requests == 1 {
			return response(`[{"id":"` + conversation + `","editor_id":"223e4567-e89b-12d3-a456-426614174002","business_owner_id":"` + subject + `","status":"active","company_name":"KIVRONIX","title":"Job","source_kind":"job"}]`), nil
		}
		return response(`[{"id":"423e4567-e89b-12d3-a456-426614174004","conversation_id":"` + conversation + `","sender_id":"523e4567-e89b-12d3-a456-426614174005","body":"Injected","created_at":"2026-09-13T23:00:00Z"}]`), nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetThread(context.Background(), "access-token", subject, conversation)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func response(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}
