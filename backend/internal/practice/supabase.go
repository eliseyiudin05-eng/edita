package practice

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrUnavailable = errors.New("practice session service unavailable")

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

const (
	maxErrorResponseBytes = 8 * 1024
	maxReadResponseBytes  = 256 * 1024
)

type Message struct {
	From string `json:"from"`
	Text string `json:"text"`
}

type Result struct {
	ClientReply  string  `json:"client_reply"`
	Score        float64 `json:"score"`
	Feedback     string  `json:"feedback"`
	BetterAnswer string  `json:"better_answer"`
}

type Session struct {
	Scenario string    `json:"scenario"`
	Messages []Message `json:"messages"`
	Result   *Result   `json:"result"`
}

type SaveResponse struct {
	OK bool `json:"ok"`
}

type StoredSession struct {
	Session
	UpdatedAt string `json:"updated_at"`
}

type ReadResponse struct {
	Session *StoredSession `json:"session"`
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
		return nil, errors.New("supabase practice client configuration is incomplete")
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
	return &Client{endpoint: projectURL + "/rest/v1/practice_sessions", publishableKey: publishableKey, httpClient: &client}, nil
}

func ValidSession(value Session) bool {
	if utf8.RuneCountInString(value.Scenario) > 2000 || len(value.Messages) > 50 {
		return false
	}
	for _, message := range value.Messages {
		if (message.From != "client" && message.From != "user") || strings.TrimSpace(message.Text) == "" || utf8.RuneCountInString(message.Text) > 2000 {
			return false
		}
	}
	if value.Result == nil {
		return true
	}
	return utf8.RuneCountInString(value.Result.ClientReply) <= 2000 &&
		utf8.RuneCountInString(value.Result.Feedback) <= 3000 &&
		utf8.RuneCountInString(value.Result.BetterAnswer) <= 3000 &&
		!math.IsNaN(value.Result.Score) && !math.IsInf(value.Result.Score, 0) && value.Result.Score >= 0 && value.Result.Score <= 100
}

func (c *Client) GetSession(ctx context.Context, accessToken, subject string) (ReadResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return ReadResponse{}, ErrUnavailable
	}
	query := url.Values{}
	query.Set("select", "user_id,scenario,messages,result,updated_at")
	query.Set("user_id", "eq."+subject)
	query.Set("limit", "1")
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return ReadResponse{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return ReadResponse{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxErrorResponseBytes))
		return ReadResponse{}, ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxReadResponseBytes+1))
	if err != nil || len(body) > maxReadResponseBytes {
		return ReadResponse{}, ErrUnavailable
	}
	var rows []struct {
		UserID string `json:"user_id"`
		StoredSession
	}
	if json.Unmarshal(body, &rows) != nil || len(rows) > 1 {
		return ReadResponse{}, ErrUnavailable
	}
	if len(rows) == 0 {
		return ReadResponse{Session: nil}, nil
	}
	row := rows[0]
	if strings.ToLower(row.UserID) != subject || !ValidSession(row.Session) {
		return ReadResponse{}, ErrUnavailable
	}
	if _, err := time.Parse(time.RFC3339Nano, row.UpdatedAt); err != nil {
		return ReadResponse{}, ErrUnavailable
	}
	if row.Messages == nil {
		row.Messages = []Message{}
	}
	return ReadResponse{Session: &row.StoredSession}, nil
}

func (c *Client) SaveSession(ctx context.Context, accessToken, subject string, session Session) (SaveResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !ValidSession(session) {
		return SaveResponse{}, ErrUnavailable
	}
	if session.Messages == nil {
		session.Messages = []Message{}
	}
	payload, err := json.Marshal(struct {
		UserID    string    `json:"user_id"`
		Scenario  string    `json:"scenario"`
		Messages  []Message `json:"messages"`
		Result    *Result   `json:"result"`
		UpdatedAt string    `json:"updated_at"`
	}{
		UserID: subject, Scenario: session.Scenario, Messages: session.Messages,
		Result: session.Result, UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return SaveResponse{}, ErrUnavailable
	}
	query := url.Values{}
	query.Set("on_conflict", "user_id")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"?"+query.Encode(), bytes.NewReader(payload))
	if err != nil {
		return SaveResponse{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	request.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return SaveResponse{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK && response.StatusCode != http.StatusNoContent {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxErrorResponseBytes))
		return SaveResponse{}, ErrUnavailable
	}
	return SaveResponse{OK: true}, nil
}
