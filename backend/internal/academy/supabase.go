package academy

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrUnavailable = errors.New("academy progress service unavailable")

var slugPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$`)

const (
	maxProgressRows  = 500
	maxResponseBytes = 256 * 1024
)

type Progress struct {
	CompletedSlugs []string `json:"completedSlugs"`
	XP             int64    `json:"xp"`
}

type Client struct {
	endpoint       string
	publishableKey string
	httpClient     *http.Client
}

type progressRow struct {
	UserID string `json:"user_id"`
	Status string `json:"status"`
	Lesson struct {
		Slug     string `json:"slug"`
		XPReward int64  `json:"xp_reward"`
	} `json:"lesson"`
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase academy client configuration is incomplete")
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
		endpoint:       projectURL + "/rest/v1/lesson_progress",
		publishableKey: publishableKey,
		httpClient:     &client,
	}, nil
}

func (c *Client) GetProgress(ctx context.Context, accessToken, subject string) (Progress, error) {
	if c == nil || strings.TrimSpace(accessToken) == "" || strings.TrimSpace(subject) == "" {
		return Progress{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "user_id,status,lesson:lessons!inner(slug,xp_reward)")
	query.Set("user_id", "eq."+subject)
	query.Set("status", "eq.completed")
	query.Set("limit", "501")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return Progress{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return Progress{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return Progress{}, ErrUnavailable
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes {
		return Progress{}, ErrUnavailable
	}
	var rows []progressRow
	if err := json.Unmarshal(body, &rows); err != nil || len(rows) > maxProgressRows {
		return Progress{}, ErrUnavailable
	}

	result := Progress{CompletedSlugs: make([]string, 0, len(rows))}
	seen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if row.UserID != subject || row.Status != "completed" || !slugPattern.MatchString(row.Lesson.Slug) || utf8.RuneCountInString(row.Lesson.Slug) > 120 || row.Lesson.XPReward < 0 || row.Lesson.XPReward > 10_000 {
			return Progress{}, ErrUnavailable
		}
		if _, exists := seen[row.Lesson.Slug]; exists {
			return Progress{}, ErrUnavailable
		}
		seen[row.Lesson.Slug] = struct{}{}
		result.CompletedSlugs = append(result.CompletedSlugs, row.Lesson.Slug)
		result.XP += row.Lesson.XPReward
	}
	sort.Strings(result.CompletedSlugs)
	return result, nil
}
