package aifeedback

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
	ErrNotFound    = errors.New("AI message not found")
	ErrUnavailable = errors.New("AI feedback service unavailable")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Feedback struct {
	MessageID string  `json:"messageId"`
	Helpful   *bool   `json:"helpful"`
	Comment   *string `json:"comment,omitempty"`
}

type Response struct {
	OK     bool `json:"ok"`
	Queued bool `json:"queued"`
}

type Client struct {
	messagesEndpoint string
	feedbackEndpoint string
	publishableKey   string
	httpClient       *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	parsed, err := url.Parse(projectURL)
	if projectURL == "" || publishableKey == "" || err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("supabase AI feedback client configuration is invalid")
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
		messagesEndpoint: projectURL + "/rest/v1/ai_messages",
		feedbackEndpoint: projectURL + "/rest/v1/ai_feedback",
		publishableKey:   publishableKey,
		httpClient:       &client,
	}, nil
}

func (c *Client) SaveFeedback(ctx context.Context, accessToken, subject string, feedback Feedback) (Response, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	feedback.MessageID = strings.ToLower(strings.TrimSpace(feedback.MessageID))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !ValidFeedback(feedback) {
		return Response{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,role,user_id")
	query.Set("id", "eq."+feedback.MessageID)
	query.Set("user_id", "eq."+subject)
	query.Set("limit", "1")
	var messages []struct {
		ID     string `json:"id"`
		Role   string `json:"role"`
		UserID string `json:"user_id"`
	}
	if err := c.getJSON(ctx, c.messagesEndpoint+"?"+query.Encode(), accessToken, &messages); err != nil || len(messages) > 1 {
		return Response{}, ErrUnavailable
	}
	if len(messages) == 0 {
		return Response{}, ErrNotFound
	}
	message := messages[0]
	if strings.ToLower(message.ID) != feedback.MessageID || strings.ToLower(message.UserID) != subject || message.Role != "assistant" {
		return Response{}, ErrNotFound
	}

	payload := map[string]any{"user_id": subject, "message_id": feedback.MessageID, "helpful": *feedback.Helpful, "comment": nil}
	if feedback.Comment != nil {
		payload["comment"] = *feedback.Comment
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Response{}, ErrUnavailable
	}
	upsertQuery := url.Values{}
	upsertQuery.Set("on_conflict", "user_id,message_id")
	upsertQuery.Set("select", "user_id,message_id,helpful,comment")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.feedbackEndpoint+"?"+upsertQuery.Encode(), bytes.NewReader(body))
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
	returned, err := io.ReadAll(io.LimitReader(response.Body, 16*1024+1))
	if err != nil || len(returned) > 16*1024 {
		return Response{}, ErrUnavailable
	}
	var rows []struct {
		UserID    string  `json:"user_id"`
		MessageID string  `json:"message_id"`
		Helpful   bool    `json:"helpful"`
		Comment   *string `json:"comment"`
	}
	if json.Unmarshal(returned, &rows) != nil || len(rows) != 1 || strings.ToLower(rows[0].UserID) != subject || strings.ToLower(rows[0].MessageID) != feedback.MessageID || rows[0].Helpful != *feedback.Helpful || !sameComment(rows[0].Comment, feedback.Comment) {
		return Response{}, ErrUnavailable
	}
	return Response{OK: true, Queued: false}, nil
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

func ValidFeedback(feedback Feedback) bool {
	if !uuidPattern.MatchString(strings.ToLower(strings.TrimSpace(feedback.MessageID))) {
		return false
	}
	return feedback.Helpful != nil && (feedback.Comment == nil || len([]rune(*feedback.Comment)) < 20)
}

func sameComment(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
