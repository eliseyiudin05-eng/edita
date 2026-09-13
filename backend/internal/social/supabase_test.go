package social

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

func TestGetRankingUsesUserTokenAndBoundedQuery(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		query := request.URL.Query()
		if request.URL.Path != "/rest/v1/public_profiles" || query.Get("limit") != "50" || query.Get("order") != "rating_points.desc,id.asc" {
			t.Fatalf("unexpected URL: %s", request.URL.String())
		}
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		body := `[{"id":"123e4567-e89b-12d3-a456-426614174000","username":"editor-one","display_name":"Editor","level":2,"xp":300,"rating_points":1200,"ai_score":90,"avatar_url":null,"school_name":null,"skills":["Reels","Color"]}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetRanking(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Ranking) != 1 || got.Ranking[0].RatingPoints != 1200 || !got.Ranking[0].Viewer || len(got.Ranking[0].Skills) != 2 || got.Ranking[0].Username == nil || *got.Ranking[0].Username != "editor-one" {
		t.Fatalf("unexpected ranking: %+v", got)
	}
	payload, err := json.Marshal(got)
	if err != nil || strings.Contains(string(payload), "123e4567") || strings.Contains(string(payload), `"id"`) {
		t.Fatalf("ranking exposes a database identifier: %s", payload)
	}
}

func TestGetRankingRejectsMalformedPublicProfile(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `[{"id":"not-a-uuid","username":"editor-one","display_name":"Editor","level":2,"xp":300,"rating_points":1200,"ai_score":90,"skills":[]}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetRanking(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}

func TestGetRankingDoesNotFollowRedirects(t *testing.T) {
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		return &http.Response{StatusCode: http.StatusFound, Body: io.NopCloser(strings.NewReader("")), Header: http.Header{"Location": []string{"https://unexpected.example/ranking"}}}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetRanking(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
	if requests != 1 {
		t.Fatalf("requests = %d, redirect was followed", requests)
	}
}
