package businessdiscussion

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
	"unicode/utf8"
)

var (
	ErrForbidden   = errors.New("business discussion forbidden")
	ErrConflict    = errors.New("business discussion idempotency conflict")
	ErrUnavailable = errors.New("business discussion unavailable")
)

const (
	topic            = "company-growth"
	maxMessages      = 80
	maxResponseBytes = 256 * 1024
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Discussion struct {
	Messages []Message `json:"messages"`
}

type CreateMessageInput struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

type CreateMessageResponse struct {
	OK bool `json:"ok"`
}

type Message struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	Author    string `json:"author"`
}

type profileRow struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}

type messageRow struct {
	ID        string `json:"id"`
	TopicKey  string `json:"topic_key"`
	AuthorID  string `json:"author_id"`
	Content   string `json:"content"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at,omitempty"`
}

type publicProfileRow struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"display_name"`
}

type Client struct {
	profilesEndpoint       string
	messagesEndpoint       string
	publicProfilesEndpoint string
	publishableKey         string
	httpClient             *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	parsed, err := url.Parse(projectURL)
	if projectURL == "" || publishableKey == "" || err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("supabase business discussion client configuration is invalid")
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
		profilesEndpoint:       projectURL + "/rest/v1/profiles",
		messagesEndpoint:       projectURL + "/rest/v1/business_discussion_messages",
		publicProfilesEndpoint: projectURL + "/rest/v1/public_profiles",
		publishableKey:         publishableKey,
		httpClient:             &client,
	}, nil
}

func (c *Client) GetDiscussion(ctx context.Context, accessToken, subject string) (Discussion, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return Discussion{}, ErrUnavailable
	}
	profileQuery := url.Values{}
	profileQuery.Set("select", "id,role")
	profileQuery.Set("id", "eq."+subject)
	profileQuery.Set("limit", "1")
	var profiles []profileRow
	if err := c.getJSON(ctx, c.profilesEndpoint+"?"+profileQuery.Encode(), accessToken, &profiles); err != nil || len(profiles) != 1 {
		return Discussion{}, ErrUnavailable
	}
	if strings.ToLower(profiles[0].ID) != subject || profiles[0].Role != "business" {
		return Discussion{}, ErrForbidden
	}

	messageQuery := url.Values{}
	messageQuery.Set("select", "id,topic_key,author_id,content,status,created_at")
	messageQuery.Set("topic_key", "eq."+topic)
	messageQuery.Set("status", "eq.published")
	messageQuery.Set("order", "created_at.desc,id.asc")
	messageQuery.Set("limit", "80")
	var rows []messageRow
	if err := c.getJSON(ctx, c.messagesEndpoint+"?"+messageQuery.Encode(), accessToken, &rows); err != nil || len(rows) > maxMessages {
		return Discussion{}, ErrUnavailable
	}
	authorIDs := make([]string, 0, len(rows))
	authorSet := make(map[string]bool, len(rows))
	for _, row := range rows {
		if !validMessage(row) {
			return Discussion{}, ErrUnavailable
		}
		authorID := strings.ToLower(row.AuthorID)
		if !authorSet[authorID] {
			authorSet[authorID] = true
			authorIDs = append(authorIDs, authorID)
		}
	}

	names := make(map[string]string, len(authorIDs))
	if len(authorIDs) > 0 {
		publicQuery := url.Values{}
		publicQuery.Set("select", "id,display_name")
		publicQuery.Set("id", "in.("+strings.Join(authorIDs, ",")+")")
		publicQuery.Set("limit", "80")
		var publicProfiles []publicProfileRow
		if err := c.getJSON(ctx, c.publicProfilesEndpoint+"?"+publicQuery.Encode(), accessToken, &publicProfiles); err != nil || len(publicProfiles) > len(authorIDs) {
			return Discussion{}, ErrUnavailable
		}
		for _, row := range publicProfiles {
			id := strings.ToLower(row.ID)
			if !uuidPattern.MatchString(id) || !authorSet[id] || !validOptionalText(row.DisplayName, 120) {
				return Discussion{}, ErrUnavailable
			}
			if row.DisplayName != nil && strings.TrimSpace(*row.DisplayName) != "" {
				names[id] = *row.DisplayName
			}
		}
	}

	messages := make([]Message, 0, len(rows))
	for index := len(rows) - 1; index >= 0; index-- {
		row := rows[index]
		author := names[strings.ToLower(row.AuthorID)]
		if author == "" {
			author = "Компания KIVRONIX"
		}
		messages = append(messages, Message{ID: row.ID, Content: row.Content, CreatedAt: row.CreatedAt, Author: author})
	}
	return Discussion{Messages: messages}, nil
}

func (c *Client) CreateMessage(ctx context.Context, accessToken, subject string, input CreateMessageInput) (CreateMessageResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	input.ID = strings.ToLower(strings.TrimSpace(input.ID))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !ValidCreateMessage(input) {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if err := c.requireBusiness(ctx, accessToken, subject); err != nil {
		return CreateMessageResponse{}, err
	}

	payload, err := json.Marshal(messageRow{
		ID: input.ID, TopicKey: topic, AuthorID: subject, Content: input.Content, Status: "published",
	})
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	query := url.Values{}
	query.Set("on_conflict", "id")
	query.Set("select", "id,topic_key,author_id,content,status,created_at")
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.messagesEndpoint+"?"+query.Encode(), bytes.NewReader(payload))
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Prefer", "resolution=ignore-duplicates,return=representation")
	c.authorize(request, accessToken)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return CreateMessageResponse{}, ErrUnavailable
	}
	var rows []messageRow
	if err := decodeBounded(response.Body, 32*1024, &rows); err != nil || len(rows) > 1 {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if len(rows) == 0 {
		row, err := c.getMessageByID(ctx, accessToken, input.ID)
		if err != nil {
			return CreateMessageResponse{}, err
		}
		rows = []messageRow{row}
	}
	if !sameCreatedMessage(rows[0], subject, input) {
		return CreateMessageResponse{}, ErrConflict
	}
	return CreateMessageResponse{OK: true}, nil
}

func (c *Client) requireBusiness(ctx context.Context, accessToken, subject string) error {
	profileQuery := url.Values{}
	profileQuery.Set("select", "id,role")
	profileQuery.Set("id", "eq."+subject)
	profileQuery.Set("limit", "1")
	var profiles []profileRow
	if err := c.getJSON(ctx, c.profilesEndpoint+"?"+profileQuery.Encode(), accessToken, &profiles); err != nil || len(profiles) != 1 {
		return ErrUnavailable
	}
	if strings.ToLower(profiles[0].ID) != subject || profiles[0].Role != "business" {
		return ErrForbidden
	}
	return nil
}

func (c *Client) getMessageByID(ctx context.Context, accessToken, id string) (messageRow, error) {
	query := url.Values{}
	query.Set("select", "id,topic_key,author_id,content,status,created_at")
	query.Set("id", "eq."+id)
	query.Set("limit", "1")
	var rows []messageRow
	if err := c.getJSON(ctx, c.messagesEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil || len(rows) != 1 {
		return messageRow{}, ErrUnavailable
	}
	return rows[0], nil
}

func (c *Client) getJSON(ctx context.Context, endpoint, accessToken string, target any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ErrUnavailable
	}
	request.Header.Set("Accept", "application/json")
	c.authorize(request, accessToken)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return ErrUnavailable
	}
	if err := decodeBounded(response.Body, maxResponseBytes, target); err != nil {
		return ErrUnavailable
	}
	return nil
}

func (c *Client) authorize(request *http.Request, accessToken string) {
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("apikey", c.publishableKey)
}

func decodeBounded(reader io.Reader, limit int64, target any) error {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil || int64(len(body)) > limit || json.Unmarshal(body, target) != nil {
		return ErrUnavailable
	}
	return nil
}

func ValidCreateMessage(input CreateMessageInput) bool {
	return uuidPattern.MatchString(strings.ToLower(input.ID)) && input.Content == strings.TrimSpace(input.Content) && utf8.ValidString(input.Content) && utf8.RuneCountInString(input.Content) >= 1 && utf8.RuneCountInString(input.Content) <= 1400
}

func sameCreatedMessage(row messageRow, subject string, input CreateMessageInput) bool {
	return strings.ToLower(row.ID) == input.ID && row.TopicKey == topic && strings.ToLower(row.AuthorID) == subject && row.Content == input.Content && row.Status == "published" && validMessage(row)
}

func validMessage(row messageRow) bool {
	if !uuidPattern.MatchString(strings.ToLower(row.ID)) || !uuidPattern.MatchString(strings.ToLower(row.AuthorID)) || row.TopicKey != topic || row.Status != "published" {
		return false
	}
	if !utf8.ValidString(row.Content) || utf8.RuneCountInString(row.Content) < 1 || utf8.RuneCountInString(row.Content) > 1400 {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, row.CreatedAt)
	return err == nil
}

func validOptionalText(value *string, maximum int) bool {
	return value == nil || (utf8.ValidString(*value) && utf8.RuneCountInString(*value) <= maximum)
}
