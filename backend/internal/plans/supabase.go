package plans

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	ErrForbidden   = errors.New("plan interest forbidden")
	ErrNotFound    = errors.New("profile not found")
	ErrUnavailable = errors.New("plan interest service unavailable")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Interest struct {
	Audience string `json:"audience"`
	Plan     string `json:"plan"`
}

type Response struct {
	OK              bool   `json:"ok"`
	Audience        string `json:"audience"`
	Plan            string `json:"plan"`
	PaymentsEnabled bool   `json:"paymentsEnabled"`
}

type Client struct {
	profilesEndpoint string
	interestEndpoint string
	publishableKey   string
	httpClient       *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase plan interest client configuration is incomplete")
	}
	parsed, err := url.Parse(projectURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("supabase project URL is invalid")
	}
	if len(publishableKey) > 4096 || strings.ContainsAny(publishableKey, "\r\n") {
		return nil, errors.New("supabase publishable key is invalid")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 3 * time.Second}
	}
	client := *httpClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{
		profilesEndpoint: projectURL + "/rest/v1/profiles",
		interestEndpoint: projectURL + "/rest/v1/future_plan_interest",
		publishableKey:   publishableKey,
		httpClient:       &client,
	}, nil
}

func (c *Client) SaveInterest(ctx context.Context, accessToken, subject string, interest Interest) (Response, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !ValidInterest(interest) {
		return Response{}, ErrUnavailable
	}

	profileQuery := url.Values{}
	profileQuery.Set("select", "id,role")
	profileQuery.Set("id", "eq."+subject)
	profileQuery.Set("limit", "1")
	var profiles []struct {
		ID   string `json:"id"`
		Role string `json:"role"`
	}
	if err := c.getJSON(ctx, c.profilesEndpoint+"?"+profileQuery.Encode(), accessToken, &profiles); err != nil || len(profiles) > 1 {
		return Response{}, ErrUnavailable
	}
	if len(profiles) == 0 {
		return Response{}, ErrNotFound
	}
	profile := profiles[0]
	if strings.ToLower(profile.ID) != subject || (profile.Role != "editor" && profile.Role != "business" && profile.Role != "admin") {
		return Response{}, ErrUnavailable
	}
	expectedAudience := "editor"
	if profile.Role == "business" {
		expectedAudience = "business"
	}
	if interest.Audience != expectedAudience {
		return Response{}, ErrForbidden
	}

	payload, err := json.Marshal(map[string]string{
		"user_id": subject, "audience": interest.Audience, "wanted_plan": interest.Plan,
		"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return Response{}, ErrUnavailable
	}
	query := url.Values{}
	query.Set("on_conflict", "user_id")
	query.Set("select", "user_id,audience,wanted_plan")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.interestEndpoint+"?"+query.Encode(), bytes.NewReader(payload))
	if err != nil {
		return Response{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Prefer", "resolution=merge-duplicates,return=representation")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return Response{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return Response{}, ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 16*1024+1))
	if err != nil || len(body) > 16*1024 {
		return Response{}, ErrUnavailable
	}
	var rows []struct {
		UserID   string `json:"user_id"`
		Audience string `json:"audience"`
		Plan     string `json:"wanted_plan"`
	}
	if json.Unmarshal(body, &rows) != nil || len(rows) != 1 || strings.ToLower(rows[0].UserID) != subject || rows[0].Audience != interest.Audience || rows[0].Plan != interest.Plan {
		return Response{}, ErrUnavailable
	}
	return Response{OK: true, Audience: interest.Audience, Plan: interest.Plan, PaymentsEnabled: false}, nil
}

func (c *Client) getJSON(ctx context.Context, endpoint, accessToken string, destination any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 16*1024+1))
	if err != nil || len(body) > 16*1024 || json.Unmarshal(body, destination) != nil {
		return ErrUnavailable
	}
	return nil
}

func ValidInterest(interest Interest) bool {
	return (interest.Audience == "editor" && interest.Plan == "creator_plus") ||
		(interest.Audience == "business" && interest.Plan == "studio_plus")
}
