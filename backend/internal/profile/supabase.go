package profile

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrNotFound    = errors.New("profile not found")
	ErrForbidden   = errors.New("profile update forbidden")
	ErrUnavailable = errors.New("profile service unavailable")
)

type LearningPreferences struct {
	Role        string      `json:"role"`
	Preferences Preferences `json:"preferences"`
}

type Preferences struct {
	Level    string `json:"level"`
	Software string `json:"software"`
	Goal     string `json:"goal"`
}

type UpdateLearningPreferencesResponse struct {
	OK         bool           `json:"ok"`
	Onboarding map[string]any `json:"onboarding"`
}

type Client struct {
	endpoint       string
	publishableKey string
	httpClient     *http.Client
}

type profileRow struct {
	ID         string          `json:"id"`
	Role       string          `json:"role"`
	Onboarding json.RawMessage `json:"onboarding"`
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase profile client configuration is incomplete")
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
		endpoint:       projectURL + "/rest/v1/profiles",
		publishableKey: publishableKey,
		httpClient:     &client,
	}, nil
}

func (c *Client) GetLearningPreferences(ctx context.Context, accessToken, subject string) (LearningPreferences, error) {
	if c == nil || strings.TrimSpace(accessToken) == "" || strings.TrimSpace(subject) == "" {
		return LearningPreferences{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,role,onboarding")
	query.Set("id", "eq."+subject)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return LearningPreferences{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return LearningPreferences{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return LearningPreferences{}, ErrUnavailable
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024+1))
	if err != nil || len(body) > 64*1024 {
		return LearningPreferences{}, ErrUnavailable
	}
	var rows []profileRow
	if err := json.Unmarshal(body, &rows); err != nil || len(rows) > 1 {
		return LearningPreferences{}, ErrUnavailable
	}
	if len(rows) == 0 {
		return LearningPreferences{}, ErrNotFound
	}
	row := rows[0]
	if row.ID != subject || !validRole(row.Role) {
		return LearningPreferences{}, ErrUnavailable
	}

	var preferences Preferences
	if len(row.Onboarding) > 0 && string(row.Onboarding) != "null" {
		if err := json.Unmarshal(row.Onboarding, &preferences); err != nil {
			return LearningPreferences{}, ErrUnavailable
		}
	}
	if err := validatePreferences(preferences); err != nil {
		return LearningPreferences{}, ErrUnavailable
	}
	return LearningPreferences{Role: row.Role, Preferences: preferences}, nil
}

func (c *Client) UpdateLearningPreferences(ctx context.Context, accessToken, subject string, preferences Preferences) (UpdateLearningPreferencesResponse, error) {
	if c == nil || strings.TrimSpace(accessToken) == "" || strings.TrimSpace(subject) == "" || validatePreferences(preferences) != nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}

	current, err := c.getProfileRow(ctx, accessToken, subject)
	if err != nil {
		return UpdateLearningPreferencesResponse{}, err
	}
	if current.Role != "editor" {
		return UpdateLearningPreferencesResponse{}, ErrForbidden
	}
	onboarding := map[string]any{}
	if len(current.Onboarding) > 0 && string(current.Onboarding) != "null" {
		if err := json.Unmarshal(current.Onboarding, &onboarding); err != nil {
			return UpdateLearningPreferencesResponse{}, ErrUnavailable
		}
	}
	onboarding["level"] = preferences.Level
	onboarding["software"] = preferences.Software
	onboarding["goal"] = preferences.Goal
	body, err := json.Marshal(map[string]any{"onboarding": onboarding})
	if err != nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	query := url.Values{}
	query.Set("select", "id,onboarding")
	query.Set("id", "eq."+subject)
	request, err := http.NewRequestWithContext(ctx, http.MethodPatch, c.endpoint+"?"+query.Encode(), strings.NewReader(string(body)))
	if err != nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Prefer", "return=representation")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	resultBody, err := io.ReadAll(io.LimitReader(response.Body, 64*1024+1))
	if err != nil || len(resultBody) > 64*1024 {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	var rows []struct {
		ID         string         `json:"id"`
		Onboarding map[string]any `json:"onboarding"`
	}
	if json.Unmarshal(resultBody, &rows) != nil || len(rows) != 1 || rows[0].ID != subject || rows[0].Onboarding == nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	return UpdateLearningPreferencesResponse{OK: true, Onboarding: rows[0].Onboarding}, nil
}

func (c *Client) getProfileRow(ctx context.Context, accessToken, subject string) (profileRow, error) {
	query := url.Values{}
	query.Set("select", "id,role,onboarding")
	query.Set("id", "eq."+subject)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return profileRow{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return profileRow{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return profileRow{}, ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024+1))
	if err != nil || len(body) > 64*1024 {
		return profileRow{}, ErrUnavailable
	}
	var rows []profileRow
	if json.Unmarshal(body, &rows) != nil || len(rows) > 1 {
		return profileRow{}, ErrUnavailable
	}
	if len(rows) == 0 {
		return profileRow{}, ErrNotFound
	}
	if rows[0].ID != subject || !validRole(rows[0].Role) {
		return profileRow{}, ErrUnavailable
	}
	return rows[0], nil
}

func validRole(role string) bool {
	return role == "editor" || role == "business" || role == "admin"
}

func validatePreferences(value Preferences) error {
	for field, item := range map[string]string{"level": value.Level, "software": value.Software, "goal": value.Goal} {
		if utf8.RuneCountInString(item) > 80 {
			return fmt.Errorf("%s is too long", field)
		}
	}
	return nil
}
