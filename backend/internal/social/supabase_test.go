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

func TestGetFriendshipsUsesParticipantFilterAndHidesProfileIDs(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	const other = "223e4567-e89b-12d3-a456-426614174001"
	const relation = "323e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		switch request.URL.Path {
		case "/rest/v1/friendships":
			if request.URL.Query().Get("or") != "(requester_id.eq."+viewer+",addressee_id.eq."+viewer+")" || request.URL.Query().Get("limit") != "200" {
				t.Fatalf("friendship query is not bounded to the verified subject: %s", request.URL.String())
			}
			body := `[{"id":"` + relation + `","requester_id":"` + other + `","addressee_id":"` + viewer + `","status":"pending","created_at":"2026-09-13T22:00:00Z"}]`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		case "/rest/v1/public_profiles":
			if request.URL.Query().Get("id") != "in.("+other+")" || request.URL.Query().Get("limit") != "200" {
				t.Fatalf("profile query is not bounded: %s", request.URL.String())
			}
			body := `[{"id":"` + other + `","username":"editor-one","display_name":"Editor","level":2,"xp":300,"rating_points":1200,"ai_score":90,"avatar_url":null,"school_name":null,"skills":[]}]`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		default:
			t.Fatalf("unexpected path: %s", request.URL.Path)
			return nil, errors.New("unexpected path")
		}
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetFriendships(context.Background(), "access-token", viewer)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || len(got.Relations) != 1 || got.Relations[0].Direction != "incoming" || got.Relations[0].Other == nil || got.Relations[0].Other.Username == nil || *got.Relations[0].Other.Username != "editor-one" {
		t.Fatalf("unexpected friendships: %+v", got)
	}
	payload, err := json.Marshal(got)
	if err != nil || strings.Contains(string(payload), viewer) || strings.Contains(string(payload), other) || strings.Contains(string(payload), "requester_id") || strings.Contains(string(payload), "addressee_id") {
		t.Fatalf("friendships expose participant IDs: %s", payload)
	}
}

func TestGetFriendshipsRejectsRelationOutsideVerifiedSubject(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		body := `[{"id":"323e4567-e89b-12d3-a456-426614174002","requester_id":"223e4567-e89b-12d3-a456-426614174001","addressee_id":"423e4567-e89b-12d3-a456-426614174003","status":"accepted","created_at":"2026-09-13T22:00:00Z"}]`
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetFriendships(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("error = %v, want ErrUnavailable", err)
	}
}
