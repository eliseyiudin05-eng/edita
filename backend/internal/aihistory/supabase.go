package aihistory

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
	ErrNotFound    = errors.New("AI history not found")
	ErrUnavailable = errors.New("AI history service unavailable")
)

const (
	maxMessages      = 80
	maxResponseBytes = 2 * 1024 * 1024
)

var (
	uuidPattern  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	scopePattern = regexp.MustCompile(`^[a-z0-9:_-]{1,100}$`)
)

type History struct {
	Conversation Conversation `json:"conversation"`
	Messages     []Message    `json:"messages"`
}

type Conversation struct {
	ID         string  `json:"id"`
	ScopeKey   string  `json:"scope_key"`
	Title      string  `json:"title"`
	LessonSlug *string `json:"lesson_slug"`
	UpdatedAt  string  `json:"updated_at"`
}

type Message struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

type conversationRow struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	ScopeKey   string  `json:"scope_key"`
	Title      string  `json:"title"`
	LessonSlug *string `json:"lesson_slug"`
	UpdatedAt  string  `json:"updated_at"`
}

type messageRow struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	UserID         string `json:"user_id"`
	Role           string `json:"role"`
	Content        string `json:"content"`
	CreatedAt      string `json:"created_at"`
}

type Client struct {
	conversationsEndpoint string
	messagesEndpoint      string
	publishableKey        string
	httpClient            *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase AI history client configuration is incomplete")
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
		conversationsEndpoint: projectURL + "/rest/v1/ai_conversations",
		messagesEndpoint:      projectURL + "/rest/v1/ai_messages",
		publishableKey:        publishableKey,
		httpClient:            &client,
	}, nil
}

func (c *Client) GetHistory(ctx context.Context, accessToken, subject, scope string) (History, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !validUUID(subject) || !ValidScope(scope) {
		return History{}, ErrUnavailable
	}

	conversationQuery := url.Values{}
	conversationQuery.Set("select", "id,user_id,scope_key,title,lesson_slug,updated_at")
	conversationQuery.Set("user_id", "eq."+subject)
	conversationQuery.Set("scope_key", "eq."+scope)
	conversationQuery.Set("limit", "1")
	var conversations []conversationRow
	if err := c.getJSON(ctx, c.conversationsEndpoint+"?"+conversationQuery.Encode(), accessToken, &conversations); err != nil || len(conversations) > 1 {
		return History{}, ErrUnavailable
	}
	if len(conversations) == 0 {
		return History{}, ErrNotFound
	}
	conversation := conversations[0]
	if !validConversation(conversation, subject, scope) {
		return History{}, ErrUnavailable
	}

	messagesQuery := url.Values{}
	messagesQuery.Set("select", "id,conversation_id,user_id,role,content,created_at")
	messagesQuery.Set("conversation_id", "eq."+strings.ToLower(conversation.ID))
	messagesQuery.Set("user_id", "eq."+subject)
	messagesQuery.Set("order", "created_at.asc,id.asc")
	messagesQuery.Set("limit", "80")
	var rows []messageRow
	if err := c.getJSON(ctx, c.messagesEndpoint+"?"+messagesQuery.Encode(), accessToken, &rows); err != nil || len(rows) > maxMessages {
		return History{}, ErrUnavailable
	}
	messages := make([]Message, 0, len(rows))
	for _, row := range rows {
		if !validMessage(row, conversation, subject) {
			return History{}, ErrUnavailable
		}
		from := "user"
		if row.Role == "assistant" {
			from = "ai"
		}
		messages = append(messages, Message{ID: strings.ToLower(row.ID), From: from, Text: row.Content, CreatedAt: row.CreatedAt})
	}
	return History{Conversation: Conversation{
		ID: strings.ToLower(conversation.ID), ScopeKey: conversation.ScopeKey, Title: conversation.Title,
		LessonSlug: conversation.LessonSlug, UpdatedAt: conversation.UpdatedAt,
	}, Messages: messages}, nil
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

func validConversation(value conversationRow, subject, scope string) bool {
	return validUUID(value.ID) && strings.EqualFold(value.UserID, subject) && value.ScopeKey == scope &&
		validText(value.Title, 1, 120) && validOptionalText(value.LessonSlug, 120) && validTime(value.UpdatedAt)
}

func validMessage(value messageRow, conversation conversationRow, subject string) bool {
	return validUUID(value.ID) && strings.EqualFold(value.ConversationID, conversation.ID) && strings.EqualFold(value.UserID, subject) &&
		(value.Role == "user" || value.Role == "assistant") && validText(value.Content, 1, 12000) && validTime(value.CreatedAt)
}

func ValidScope(value string) bool { return scopePattern.MatchString(value) }
func validUUID(value string) bool  { return uuidPattern.MatchString(strings.ToLower(value)) }
func validText(value string, minimum, maximum int) bool {
	length := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && length >= minimum && length <= maximum
}
func validOptionalText(value *string, maximum int) bool {
	return value == nil || validText(*value, 1, maximum)
}
func validTime(value string) bool {
	if len(value) > 64 {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}
