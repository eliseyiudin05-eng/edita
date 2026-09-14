package practice

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

func TestGetSessionUsesVerifiedSubjectAndOmitsOwner(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174000"
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet || request.URL.Query().Get("user_id") != "eq."+subject || request.URL.Query().Get("limit") != "1" {
			t.Fatalf("read is not owner-scoped: %s %s", request.Method, request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		body := `[{"user_id":"` + subject + `","scenario":"brief","messages":[{"from":"user","text":"hello"}],"result":null,"updated_at":"2026-09-14T10:00:00Z"}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetSession(context.Background(), "access-token", subject)
	if err != nil || got.Session == nil || got.Session.Scenario != "brief" {
		t.Fatalf("result=%+v error=%v", got, err)
	}
	payload, _ := json.Marshal(got)
	if strings.Contains(string(payload), subject) || strings.Contains(string(payload), "user_id") {
		t.Fatalf("owner leaked: %s", payload)
	}
}

func TestGetSessionReturnsNullWhenAbsent(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.GetSession(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000")
	if err != nil || got.Session != nil {
		t.Fatalf("result=%+v error=%v", got, err)
	}
}

func TestGetSessionRejectsUnexpectedOwner(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `[{"user_id":"223e4567-e89b-12d3-a456-426614174001","scenario":"","messages":[],"result":null,"updated_at":"2026-09-14T10:00:00Z"}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetSession(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000"); err == nil {
		t.Fatal("unexpected owner accepted")
	}
}

func TestSaveSessionUsesVerifiedSubjectAndUserJWT(t *testing.T) {
	const subject = "123e4567-e89b-12d3-a456-426614174000"
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPost || request.URL.Path != "/rest/v1/practice_sessions" || request.URL.Query().Get("on_conflict") != "user_id" {
			t.Fatalf("unexpected request: %s %s", request.Method, request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" || request.Header.Get("Prefer") != "resolution=merge-duplicates,return=minimal" {
			t.Fatalf("authentication or upsert headers missing: %v", request.Header)
		}
		var payload struct {
			UserID   string    `json:"user_id"`
			Messages []Message `json:"messages"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil || payload.UserID != subject || len(payload.Messages) != 1 {
			t.Fatalf("unexpected payload: %+v error=%v", payload, err)
		}
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.SaveSession(context.Background(), "access-token", subject, Session{Scenario: "Client brief", Messages: []Message{{From: "user", Text: "Hello"}}})
	if err != nil || !got.OK {
		t.Fatalf("result=%+v error=%v", got, err)
	}
}

func TestValidSessionRejectsUnboundedOrInvalidValues(t *testing.T) {
	if ValidSession(Session{Scenario: strings.Repeat("я", 2001)}) {
		t.Fatal("oversized scenario accepted")
	}
	if ValidSession(Session{Messages: []Message{{From: "system", Text: "hidden"}}}) {
		t.Fatal("invalid sender accepted")
	}
	if ValidSession(Session{Messages: []Message{{From: "user", Text: "   "}}}) {
		t.Fatal("empty message accepted")
	}
	if ValidSession(Session{Result: &Result{Score: 101}}) {
		t.Fatal("invalid score accepted")
	}
}

func TestSaveSessionDoesNotFollowRedirects(t *testing.T) {
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		return &http.Response{StatusCode: http.StatusFound, Body: io.NopCloser(strings.NewReader("")), Header: http.Header{"Location": []string{"https://unexpected.example/session"}}}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.SaveSession(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000", Session{}); err == nil {
		t.Fatal("redirect response accepted")
	}
	if requests != 1 {
		t.Fatalf("requests=%d, redirect was followed", requests)
	}
}
