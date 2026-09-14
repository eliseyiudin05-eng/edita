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

const maxResponseBytes = 8 * 1024

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

type Response struct {
	OK bool `json:"ok"`
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

func (c *Client) SaveSession(ctx context.Context, accessToken, subject string, session Session) (Response, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !ValidSession(session) {
		return Response{}, ErrUnavailable
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
		return Response{}, ErrUnavailable
	}
	query := url.Values{}
	query.Set("on_conflict", "user_id")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"?"+query.Encode(), bytes.NewReader(payload))
	if err != nil {
		return Response{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
	request.Header.Set("Prefer", "resolution=merge-duplicates,return=minimal")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return Response{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK && response.StatusCode != http.StatusNoContent {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxResponseBytes))
		return Response{}, ErrUnavailable
	}
	return Response{OK: true}, nil
}
