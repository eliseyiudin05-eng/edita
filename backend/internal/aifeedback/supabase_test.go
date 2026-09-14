package aifeedback

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

func TestSaveFeedbackUsesOwnedAssistantMessageAndUserJWT(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174000"
	const messageID = "223e4567-e89b-12d3-a456-426614174001"
	requests := 0
	comment := "Спасибо"
	helpful := true
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("user authentication headers missing")
		}
		if requests == 1 {
			if request.Method != http.MethodGet || request.URL.Path != "/rest/v1/ai_messages" || request.URL.Query().Get("id") != "eq."+messageID || request.URL.Query().Get("user_id") != "eq."+subject {
				t.Fatalf("message lookup is not owner-scoped: %s %s", request.Method, request.URL.String())
			}
			body := `[{"id":"` + messageID + `","role":"assistant","user_id":"` + subject + `"}]`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		}
		if request.Method != http.MethodPost || request.URL.Path != "/rest/v1/ai_feedback" || request.URL.Query().Get("on_conflict") != "user_id,message_id" {
			t.Fatalf("unexpected upsert: %s %s", request.Method, request.URL.String())
		}
		var payload map[string]any
		if json.NewDecoder(request.Body).Decode(&payload) != nil || payload["user_id"] != subject || payload["message_id"] != messageID || payload["helpful"] != true || payload["comment"] != comment {
			t.Fatalf("unexpected payload: %+v", payload)
		}
		body := `[{"user_id":"` + subject + `","message_id":"` + messageID + `","helpful":true,"comment":"` + comment + `"}]`
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.SaveFeedback(context.Background(), "access-token", subject, Feedback{MessageID: messageID, Helpful: &helpful, Comment: &comment})
	if err != nil || !got.OK || got.Queued || requests != 2 {
		t.Fatalf("result=%+v requests=%d error=%v", got, requests, err)
	}
}

func TestSaveFeedbackRejectsUserMessageBeforeWrite(t *testing.T) {
	writes := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet {
			writes++
		}
		body := `[{"id":"223e4567-e89b-12d3-a456-426614174001","role":"user","user_id":"123e4567-e89b-12d3-a456-426614174000"}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	helpful := false
	_, err = client.SaveFeedback(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000", Feedback{MessageID: "223e4567-e89b-12d3-a456-426614174001", Helpful: &helpful})
	if err != ErrNotFound || writes != 0 {
		t.Fatalf("error=%v writes=%d", err, writes)
	}
}

func TestValidFeedbackExcludesKnowledgeCandidateComments(t *testing.T) {
	long := "12345678901234567890"
	helpful := true
	if ValidFeedback(Feedback{MessageID: "223e4567-e89b-12d3-a456-426614174001", Helpful: &helpful, Comment: &long}) {
		t.Fatal("queue-eligible comment must stay on legacy path")
	}
}

func TestValidFeedbackRequiresHelpfulBoolean(t *testing.T) {
	if ValidFeedback(Feedback{MessageID: "223e4567-e89b-12d3-a456-426614174001"}) {
		t.Fatal("missing helpful value accepted")
	}
}
