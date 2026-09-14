package editorverification

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrUnavailable = errors.New("editor verification service unavailable")
	ErrForbidden   = errors.New("editor role required")
)

const maxResponseBytes = 32 * 1024

var (
	uuidPattern   = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	statusPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)
)

type Verification struct {
	EmailVerified    bool                 `json:"emailVerified"`
	AgeGroup         string               `json:"ageGroup"`
	GuardianVerified bool                 `json:"guardianVerified"`
	Level            string               `json:"level"`
	Request          *VerificationRequest `json:"request"`
}

type VerificationRequest struct {
	ID           string  `json:"id"`
	PortfolioURL *string `json:"portfolio_url"`
	SampleURL    *string `json:"sample_url"`
	Note         *string `json:"note"`
	Status       string  `json:"status"`
	ReviewNote   *string `json:"review_note"`
	CreatedAt    string  `json:"created_at"`
	ReviewedAt   *string `json:"reviewed_at"`
}

type authUser struct {
	ID               string  `json:"id"`
	EmailConfirmedAt *string `json:"email_confirmed_at"`
}

type profileRow struct {
	ID                      string         `json:"id"`
	Role                    string         `json:"role"`
	Onboarding              map[string]any `json:"onboarding"`
	GuardianVerified        bool           `json:"guardian_verified"`
	EditorVerificationLevel *string        `json:"editor_verification_level"`
}

type requestRow struct {
	ID           string  `json:"id"`
	UserID       string  `json:"user_id"`
	PortfolioURL *string `json:"portfolio_url"`
	SampleURL    *string `json:"sample_url"`
	Note         *string `json:"note"`
	Status       string  `json:"status"`
	ReviewNote   *string `json:"review_note"`
	CreatedAt    string  `json:"created_at"`
	ReviewedAt   *string `json:"reviewed_at"`
}

type Client struct {
	authUserEndpoint string
	profilesEndpoint string
	requestsEndpoint string
	publishableKey   string
	httpClient       *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	parsed, err := url.Parse(projectURL)
	if projectURL == "" || publishableKey == "" || err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("supabase editor verification client configuration is invalid")
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
		authUserEndpoint: projectURL + "/auth/v1/user",
		profilesEndpoint: projectURL + "/rest/v1/profiles",
		requestsEndpoint: projectURL + "/rest/v1/editor_verification_requests",
		publishableKey:   publishableKey,
		httpClient:       &client,
	}, nil
}

func (c *Client) GetVerification(ctx context.Context, accessToken, subject string) (Verification, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return Verification{}, ErrUnavailable
	}

	var user authUser
	if err := c.getJSON(ctx, c.authUserEndpoint, accessToken, &user); err != nil || strings.ToLower(user.ID) != subject || !validOptionalTime(user.EmailConfirmedAt) {
		return Verification{}, ErrUnavailable
	}

	profileQuery := url.Values{}
	profileQuery.Set("select", "id,role,onboarding,guardian_verified,editor_verification_level")
	profileQuery.Set("id", "eq."+subject)
	profileQuery.Set("limit", "1")
	var profiles []profileRow
	if err := c.getJSON(ctx, c.profilesEndpoint+"?"+profileQuery.Encode(), accessToken, &profiles); err != nil || len(profiles) != 1 {
		return Verification{}, ErrUnavailable
	}
	profile := profiles[0]
	if strings.ToLower(profile.ID) != subject || profile.Role != "editor" {
		return Verification{}, ErrForbidden
	}

	requestQuery := url.Values{}
	requestQuery.Set("select", "id,user_id,portfolio_url,sample_url,note,status,review_note,created_at,reviewed_at")
	requestQuery.Set("user_id", "eq."+subject)
	requestQuery.Set("order", "created_at.desc,id.asc")
	requestQuery.Set("limit", "1")
	var requests []requestRow
	if err := c.getJSON(ctx, c.requestsEndpoint+"?"+requestQuery.Encode(), accessToken, &requests); err != nil || len(requests) > 1 {
		return Verification{}, ErrUnavailable
	}

	ageGroup := "18+"
	if value, ok := profile.Onboarding["ageGroup"].(string); ok && validText(value, 1, 32) {
		ageGroup = value
	}
	level := "basic"
	if profile.EditorVerificationLevel != nil {
		if !validStatus(*profile.EditorVerificationLevel) {
			return Verification{}, ErrUnavailable
		}
		level = *profile.EditorVerificationLevel
	}
	result := Verification{EmailVerified: user.EmailConfirmedAt != nil, AgeGroup: ageGroup, GuardianVerified: profile.GuardianVerified, Level: level}
	if len(requests) == 1 {
		row := requests[0]
		if !validRequest(row) || strings.ToLower(row.UserID) != subject {
			return Verification{}, ErrUnavailable
		}
		result.Request = &VerificationRequest{ID: row.ID, PortfolioURL: row.PortfolioURL, SampleURL: row.SampleURL, Note: row.Note, Status: row.Status, ReviewNote: row.ReviewNote, CreatedAt: row.CreatedAt, ReviewedAt: row.ReviewedAt}
	}
	return result, nil
}

func (c *Client) getJSON(ctx context.Context, endpoint, accessToken string, target any) error {
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
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes || json.Unmarshal(body, target) != nil {
		return ErrUnavailable
	}
	return nil
}

func validRequest(row requestRow) bool {
	return uuidPattern.MatchString(strings.ToLower(row.ID)) && uuidPattern.MatchString(strings.ToLower(row.UserID)) &&
		validOptionalText(row.PortfolioURL, 500) && validOptionalText(row.SampleURL, 500) && validOptionalText(row.Note, 1200) &&
		validStatus(row.Status) && validOptionalText(row.ReviewNote, 1200) && validTime(row.CreatedAt) && validOptionalTime(row.ReviewedAt)
}

func validStatus(value string) bool { return statusPattern.MatchString(value) }
func validText(value string, minimum, maximum int) bool {
	length := utf8.RuneCountInString(value)
	return length >= minimum && length <= maximum
}
func validOptionalText(value *string, maximum int) bool {
	return value == nil || utf8.RuneCountInString(*value) <= maximum
}
func validOptionalTime(value *string) bool { return value == nil || validTime(*value) }
func validTime(value string) bool {
	if len(value) > 64 {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}
