package chat

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

var ErrUnavailable = errors.New("private chat service unavailable")

const (
	maxMessages      = 200
	maxResponseBytes = 256 * 1024
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Thread struct {
	ViewerID     string       `json:"viewerId"`
	Conversation Conversation `json:"conversation"`
	Messages     []Message    `json:"messages"`
}

type Conversation struct {
	ID              string `json:"id"`
	EditorID        string `json:"editor_id"`
	BusinessOwnerID string `json:"business_owner_id"`
	Status          string `json:"status"`
	CompanyName     string `json:"company_name"`
	Title           string `json:"title"`
	SourceKind      string `json:"source_kind"`
}

type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id"`
	SenderID       string `json:"sender_id"`
	Body           string `json:"body"`
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
		return nil, errors.New("supabase private chat client configuration is incomplete")
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
		conversationsEndpoint: projectURL + "/rest/v1/private_conversations",
		messagesEndpoint:      projectURL + "/rest/v1/private_messages",
		publishableKey:        publishableKey,
		httpClient:            &client,
	}, nil
}

func (c *Client) GetThread(ctx context.Context, accessToken, subject, conversationID string) (Thread, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	conversationID = strings.ToLower(strings.TrimSpace(conversationID))
	if c == nil || strings.TrimSpace(accessToken) == "" || !validUUID(subject) || !validUUID(conversationID) {
		return Thread{}, ErrUnavailable
	}

	conversationQuery := url.Values{}
	conversationQuery.Set("select", "id,editor_id,business_owner_id,status,company_name,title,source_kind")
	conversationQuery.Set("id", "eq."+conversationID)
	conversationQuery.Set("or", "(editor_id.eq."+subject+",business_owner_id.eq."+subject+")")
	conversationQuery.Set("limit", "1")
	var conversations []Conversation
	if err := c.getJSON(ctx, c.conversationsEndpoint+"?"+conversationQuery.Encode(), accessToken, &conversations); err != nil || len(conversations) != 1 {
		return Thread{}, ErrUnavailable
	}
	conversation := conversations[0]
	if !validConversation(conversation) || strings.ToLower(conversation.ID) != conversationID ||
		(strings.ToLower(conversation.EditorID) != subject && strings.ToLower(conversation.BusinessOwnerID) != subject) {
		return Thread{}, ErrUnavailable
	}

	messagesQuery := url.Values{}
	messagesQuery.Set("select", "id,conversation_id,sender_id,body,created_at")
	messagesQuery.Set("conversation_id", "eq."+conversationID)
	messagesQuery.Set("order", "created_at.asc,id.asc")
	messagesQuery.Set("limit", "200")
	var messages []Message
	if err := c.getJSON(ctx, c.messagesEndpoint+"?"+messagesQuery.Encode(), accessToken, &messages); err != nil || len(messages) > maxMessages {
		return Thread{}, ErrUnavailable
	}
	for _, message := range messages {
		if !validMessage(message, conversation) {
			return Thread{}, ErrUnavailable
		}
	}
	if messages == nil {
		messages = []Message{}
	}
	return Thread{ViewerID: subject, Conversation: conversation, Messages: messages}, nil
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

func validConversation(value Conversation) bool {
	return validUUID(value.ID) && validUUID(value.EditorID) && validUUID(value.BusinessOwnerID) && !strings.EqualFold(value.EditorID, value.BusinessOwnerID) &&
		validText(value.CompanyName, 1, 160) && validText(value.Title, 1, 180) &&
		(value.Status == "active" || value.Status == "closed") &&
		(value.SourceKind == "campaign" || value.SourceKind == "challenge" || value.SourceKind == "job" || value.SourceKind == "kivronix_contest")
}

func validMessage(value Message, conversation Conversation) bool {
	sender := strings.ToLower(value.SenderID)
	return validUUID(value.ID) && strings.EqualFold(value.ConversationID, conversation.ID) &&
		(sender == strings.ToLower(conversation.EditorID) || sender == strings.ToLower(conversation.BusinessOwnerID)) &&
		validText(value.Body, 1, 1500) && validTime(value.CreatedAt)
}

func validUUID(value string) bool { return uuidPattern.MatchString(strings.ToLower(value)) }
func ValidConversationID(value string) bool {
	return validUUID(strings.TrimSpace(value))
}
func validText(value string, minimum, maximum int) bool {
	length := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && length >= minimum && length <= maximum
}
func validTime(value string) bool {
	if len(value) > 64 {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}
