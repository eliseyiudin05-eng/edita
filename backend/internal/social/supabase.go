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

var ErrUnavailable = errors.New("social service unavailable")

var (
	uuidPattern     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,29}$`)
)

const (
	maxRankingRows   = 50
	maxFriendRows    = 200
	maxResponseBytes = 256 * 1024
)

type Ranking struct {
	Ranking []RankRow `json:"ranking"`
}

type Friendships struct {
	Relations []FriendRelation `json:"relations"`
}

type FriendRelation struct {
	ID        string         `json:"id"`
	Status    string         `json:"status"`
	Direction string         `json:"direction"`
	CreatedAt string         `json:"created_at"`
	Other     *FriendProfile `json:"other"`
}

type FriendProfile struct {
	Username     *string `json:"username"`
	DisplayName  *string `json:"display_name"`
	Level        int64   `json:"level"`
	XP           int64   `json:"xp"`
	RatingPoints int64   `json:"rating_points"`
	AIScore      *int64  `json:"ai_score"`
	AvatarURL    *string `json:"avatar_url"`
	SchoolName   *string `json:"school_name"`
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

type friendshipRow struct {
	ID          string `json:"id"`
	RequesterID string `json:"requester_id"`
	AddresseeID string `json:"addressee_id"`
	Status      string `json:"status"`
	CreatedAt   string `json:"created_at"`
}

type Client struct {
	rankingEndpoint string
	friendsEndpoint string
	publishableKey  string
	httpClient      *http.Client
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
		rankingEndpoint: projectURL + "/rest/v1/public_profiles",
		friendsEndpoint: projectURL + "/rest/v1/friendships",
		publishableKey:  publishableKey,
		httpClient:      &client,
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
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.rankingEndpoint+"?"+query.Encode(), nil)
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

func (c *Client) GetFriendships(ctx context.Context, accessToken, subject string) (Friendships, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return Friendships{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,requester_id,addressee_id,status,created_at")
	query.Set("or", "(requester_id.eq."+subject+",addressee_id.eq."+subject+")")
	query.Set("order", "created_at.desc")
	query.Set("limit", "200")
	var rows []friendshipRow
	if err := c.getJSON(ctx, c.friendsEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil || len(rows) > maxFriendRows {
		return Friendships{}, ErrUnavailable
	}

	otherIDs := make([]string, 0, len(rows))
	seen := make(map[string]bool, len(rows))
	for _, row := range rows {
		if !validFriendshipRow(row, subject) {
			return Friendships{}, ErrUnavailable
		}
		otherID := strings.ToLower(row.RequesterID)
		if otherID == subject {
			otherID = strings.ToLower(row.AddresseeID)
		}
		if !seen[otherID] {
			seen[otherID] = true
			otherIDs = append(otherIDs, otherID)
		}
	}

	profiles := make(map[string]profileRow, len(otherIDs))
	if len(otherIDs) > 0 {
		profileQuery := url.Values{}
		profileQuery.Set("select", "id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills")
		profileQuery.Set("id", "in.("+strings.Join(otherIDs, ",")+")")
		profileQuery.Set("limit", "200")
		var profileRows []profileRow
		if err := c.getJSON(ctx, c.rankingEndpoint+"?"+profileQuery.Encode(), accessToken, &profileRows); err != nil || len(profileRows) > maxFriendRows {
			return Friendships{}, ErrUnavailable
		}
		for _, row := range profileRows {
			if !validRow(row) || !seen[strings.ToLower(row.ID)] {
				return Friendships{}, ErrUnavailable
			}
			profiles[strings.ToLower(row.ID)] = row
		}
	}

	relations := make([]FriendRelation, 0, len(rows))
	for _, row := range rows {
		direction := "incoming"
		otherID := strings.ToLower(row.RequesterID)
		if otherID == subject {
			direction = "outgoing"
			otherID = strings.ToLower(row.AddresseeID)
		}
		var other *FriendProfile
		if profile, ok := profiles[otherID]; ok {
			other = &FriendProfile{
				Username: profile.Username, DisplayName: profile.DisplayName, Level: profile.Level,
				XP: profile.XP, RatingPoints: profile.RatingPoints, AIScore: profile.AIScore,
				AvatarURL: profile.AvatarURL, SchoolName: profile.SchoolName,
			}
		}
		relations = append(relations, FriendRelation{
			ID: row.ID, Status: row.Status, Direction: direction, CreatedAt: row.CreatedAt, Other: other,
		})
	}
	return Friendships{Relations: relations}, nil
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
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes || json.Unmarshal(body, destination) != nil {
		return ErrUnavailable
	}
	return nil
}

func validFriendshipRow(row friendshipRow, subject string) bool {
	requester := strings.ToLower(row.RequesterID)
	addressee := strings.ToLower(row.AddresseeID)
	if !uuidPattern.MatchString(strings.ToLower(row.ID)) || !uuidPattern.MatchString(requester) || !uuidPattern.MatchString(addressee) || requester == addressee {
		return false
	}
	if requester != subject && addressee != subject {
		return false
	}
	if row.Status != "pending" && row.Status != "accepted" && row.Status != "declined" {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, row.CreatedAt)
	return err == nil
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
