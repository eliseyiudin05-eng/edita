package social

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

var ErrUnavailable = errors.New("social ranking service unavailable")

var (
	uuidPattern     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,29}$`)
)

const (
	maxRankingRows   = 50
	maxResponseBytes = 256 * 1024
)

type Ranking struct {
	Ranking []RankRow `json:"ranking"`
}

type RankRow struct {
	Username     *string  `json:"username"`
	DisplayName  *string  `json:"display_name"`
	Level        int64    `json:"level"`
	XP           int64    `json:"xp"`
	RatingPoints int64    `json:"rating_points"`
	AIScore      *int64   `json:"ai_score"`
	AvatarURL    *string  `json:"avatar_url"`
	SchoolName   *string  `json:"school_name"`
	Skills       []string `json:"skills"`
	Viewer       bool     `json:"viewer"`
}

type profileRow struct {
	ID           string   `json:"id"`
	Username     *string  `json:"username"`
	DisplayName  *string  `json:"display_name"`
	Level        int64    `json:"level"`
	XP           int64    `json:"xp"`
	RatingPoints int64    `json:"rating_points"`
	AIScore      *int64   `json:"ai_score"`
	AvatarURL    *string  `json:"avatar_url"`
	SchoolName   *string  `json:"school_name"`
	Skills       []string `json:"skills"`
}

type Client struct {
	endpoint       string
	publishableKey string
	httpClient     *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase social client configuration is incomplete")
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
		endpoint:       projectURL + "/rest/v1/public_profiles",
		publishableKey: publishableKey,
		httpClient:     &client,
	}, nil
}

func (c *Client) GetRanking(ctx context.Context, accessToken, subject string) (Ranking, error) {
	subject = strings.TrimSpace(subject)
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(strings.ToLower(subject)) {
		return Ranking{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills")
	query.Set("order", "rating_points.desc,id.asc")
	query.Set("limit", "50")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return Ranking{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return Ranking{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return Ranking{}, ErrUnavailable
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes {
		return Ranking{}, ErrUnavailable
	}
	var rows []profileRow
	if err := json.Unmarshal(body, &rows); err != nil || len(rows) > maxRankingRows {
		return Ranking{}, ErrUnavailable
	}
	ranking := make([]RankRow, 0, len(rows))
	for _, row := range rows {
		if !validRow(row) {
			return Ranking{}, ErrUnavailable
		}
		skills := make([]string, min(3, len(row.Skills)))
		copy(skills, row.Skills)
		ranking = append(ranking, RankRow{
			Username: row.Username, DisplayName: row.DisplayName, Level: row.Level, XP: row.XP,
			RatingPoints: row.RatingPoints, AIScore: row.AIScore, AvatarURL: row.AvatarURL,
			SchoolName: row.SchoolName, Skills: skills,
			Viewer: strings.EqualFold(row.ID, subject),
		})
	}
	return Ranking{Ranking: ranking}, nil
}

func validRow(row profileRow) bool {
	if !uuidPattern.MatchString(strings.ToLower(row.ID)) || row.Level < 1 || row.Level > 100 || row.XP < 0 || row.XP > 100_000_000 || row.RatingPoints < 0 || row.RatingPoints > 1_000_000_000 {
		return false
	}
	if row.AIScore != nil && (*row.AIScore < 0 || *row.AIScore > 100) {
		return false
	}
	if row.Username != nil && !usernamePattern.MatchString(*row.Username) {
		return false
	}
	if !validOptional(row.DisplayName, 120) || !validOptional(row.AvatarURL, 700) || !validOptional(row.SchoolName, 160) {
		return false
	}
	if row.Skills == nil || len(row.Skills) > 20 {
		return false
	}
	for _, skill := range row.Skills {
		if !utf8.ValidString(skill) || utf8.RuneCountInString(skill) > 80 {
			return false
		}
	}
	return true
}

func validOptional(value *string, maximum int) bool {
	return value == nil || (utf8.ValidString(*value) && utf8.RuneCountInString(*value) <= maximum)
}
