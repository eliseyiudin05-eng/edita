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

func TestCancelFriendRequestUsesRequesterAndPendingFilters(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	const other = "223e4567-e89b-12d3-a456-426614174001"
	const relation = "323e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		if requests == 1 {
			if request.Method != http.MethodGet || request.URL.Query().Get("id") != "eq."+relation || request.URL.Query().Get("limit") != "1" {
				t.Fatalf("unexpected ownership check: %s %s", request.Method, request.URL.String())
			}
			body := `[{"id":"` + relation + `","requester_id":"` + viewer + `","addressee_id":"` + other + `","status":"pending","created_at":"2026-09-13T22:00:00Z"}]`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		}
		query := request.URL.Query()
		if request.Method != http.MethodDelete || query.Get("id") != "eq."+relation || query.Get("requester_id") != "eq."+viewer || query.Get("status") != "eq.pending" || request.Header.Get("Prefer") != "return=representation" {
			t.Fatalf("delete is not explicitly scoped: %s %s headers=%v", request.Method, request.URL.String(), request.Header)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"` + relation + `"}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.CancelFriendRequest(context.Background(), "access-token", viewer, relation); err != nil || requests != 2 {
		t.Fatalf("error=%v requests=%d", err, requests)
	}
}

func TestCancelFriendRequestIsIdempotentWhenRelationIsAbsent(t *testing.T) {
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.CancelFriendRequest(context.Background(), "access-token", "123e4567-e89b-12d3-a456-426614174000", "323e4567-e89b-12d3-a456-426614174002"); err != nil {
		t.Fatalf("error = %v", err)
	}
}

func TestCancelFriendRequestRejectsAddressee(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	body := `[{"id":"323e4567-e89b-12d3-a456-426614174002","requester_id":"223e4567-e89b-12d3-a456-426614174001","addressee_id":"` + viewer + `","status":"pending","created_at":"2026-09-13T22:00:00Z"}]`
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.CancelFriendRequest(context.Background(), "access-token", viewer, "323e4567-e89b-12d3-a456-426614174002"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestRespondToFriendRequestUsesAddresseePendingFilters(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	const other = "223e4567-e89b-12d3-a456-426614174001"
	const relation = "323e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		if requests == 1 {
			body := `[{"id":"` + relation + `","requester_id":"` + other + `","addressee_id":"` + viewer + `","status":"pending","created_at":"2026-09-13T22:00:00Z"}]`
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		}
		query := request.URL.Query()
		if request.Method != http.MethodPatch || query.Get("id") != "eq."+relation || query.Get("addressee_id") != "eq."+viewer || query.Get("status") != "eq.pending" || request.Header.Get("Prefer") != "return=representation" {
			t.Fatalf("update is not explicitly scoped: %s %s headers=%v", request.Method, request.URL.String(), request.Header)
		}
		payload, _ := io.ReadAll(request.Body)
		if !strings.Contains(string(payload), `"status":"accepted"`) || !strings.Contains(string(payload), `"responded_at":`) {
			t.Fatalf("unexpected payload: %s", payload)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`[{"id":"` + relation + `","status":"accepted"}]`)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.RespondToFriendRequest(context.Background(), "access-token", viewer, relation, "accept")
	if err != nil || !got.OK || got.Status != "accepted" || requests != 2 {
		t.Fatalf("result=%+v error=%v requests=%d", got, err, requests)
	}
}

func TestRespondToFriendRequestIsIdempotentForSameStatus(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	body := `[{"id":"323e4567-e89b-12d3-a456-426614174002","requester_id":"223e4567-e89b-12d3-a456-426614174001","addressee_id":"` + viewer + `","status":"declined","created_at":"2026-09-13T22:00:00Z"}]`
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.RespondToFriendRequest(context.Background(), "access-token", viewer, "323e4567-e89b-12d3-a456-426614174002", "decline")
	if err != nil || got.Status != "declined" || requests != 1 {
		t.Fatalf("result=%+v error=%v requests=%d", got, err, requests)
	}
}

func TestRespondToFriendRequestRejectsRequester(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	body := `[{"id":"323e4567-e89b-12d3-a456-426614174002","requester_id":"` + viewer + `","addressee_id":"223e4567-e89b-12d3-a456-426614174001","status":"pending","created_at":"2026-09-13T22:00:00Z"}]`
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.RespondToFriendRequest(context.Background(), "access-token", viewer, "323e4567-e89b-12d3-a456-426614174002", "accept"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("error = %v, want ErrForbidden", err)
	}
}

func TestGetGroupsUsesVerifiedMembershipAndBoundedQueries(t *testing.T) {
	const viewer = "123e4567-e89b-12d3-a456-426614174000"
	const other = "223e4567-e89b-12d3-a456-426614174001"
	const group = "323e4567-e89b-12d3-a456-426614174002"
	requests := 0
	client, err := NewClient("https://project.supabase.co", "sb_publishable_test", &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.Header.Get("Authorization") != "Bearer access-token" || request.Header.Get("apikey") != "sb_publishable_test" {
			t.Fatal("authentication headers missing")
		}
		var body string
		switch {
		case request.URL.Path == "/rest/v1/study_group_members" && request.URL.Query().Get("user_id") != "":
			if request.URL.Query().Get("user_id") != "eq."+viewer || request.URL.Query().Get("limit") != "20" {
				t.Fatalf("own membership query is not bounded: %s", request.URL.String())
			}
			body = `[{"group_id":"` + group + `","user_id":"` + viewer + `","member_role":"owner","joined_at":"2026-09-13T22:00:00Z"}]`
		case request.URL.Path == "/rest/v1/study_groups":
			if request.URL.Query().Get("id") != "in.("+group+")" || request.URL.Query().Get("limit") != "20" {
				t.Fatalf("group query is not bounded: %s", request.URL.String())
			}
			body = `[{"id":"` + group + `","name":"Editors","description":"Practice","owner_id":"` + viewer + `","age_scope":"18+","join_code":"ABC123","max_members":10,"created_at":"2026-09-13T22:00:00Z"}]`
		case request.URL.Path == "/rest/v1/study_group_members":
			if request.URL.Query().Get("group_id") != "in.("+group+")" || request.URL.Query().Get("limit") != "500" {
				t.Fatalf("member query is not bounded: %s", request.URL.String())
			}
			body = `[{"group_id":"` + group + `","user_id":"` + viewer + `","member_role":"owner","joined_at":"2026-09-13T22:00:00Z"},{"group_id":"` + group + `","user_id":"` + other + `","member_role":"member","joined_at":"2026-09-13T22:01:00Z"}]`
		case request.URL.Path == "/rest/v1/public_profiles":
			if request.URL.Query().Get("limit") != "50" {
				t.Fatalf("profile query is not chunked: %s", request.URL.String())
			}
			body = `[{"id":"` + viewer + `","username":"viewer-one","display_name":"Viewer","level":2,"xp":300,"rating_points":800,"ai_score":80,"avatar_url":null,"school_name":null,"skills":[]},{"id":"` + other + `","username":"editor-one","display_name":"Editor","level":3,"xp":500,"rating_points":1200,"ai_score":90,"avatar_url":null,"school_name":null,"skills":[]}]`
		default:
			t.Fatalf("unexpected URL: %s", request.URL.String())
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})})
	if err != nil {
		t.Fatal(err)
	}

	got, err := client.GetGroups(context.Background(), "access-token", viewer)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 4 || len(got.Groups) != 1 || len(got.Groups[0].Members) != 2 || got.Groups[0].Members[0].UserID != other || got.Groups[0].JoinCode != "ABC123" {
		t.Fatalf("unexpected groups: %+v", got)
	}
	payload, err := json.Marshal(got)
	if err != nil || strings.Contains(string(payload), "owner_id") {
		t.Fatalf("groups expose owner identity: %s", payload)
	}
}
