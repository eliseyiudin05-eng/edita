package editordiscussion

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
	ErrForbidden   = errors.New("editor discussion forbidden")
	ErrConflict    = errors.New("editor discussion idempotency conflict")
	ErrUnavailable = errors.New("editor discussion unavailable")
)

const (
	topic            = "editors-in-cinema"
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
	ID        string  `json:"id"`
	Content   string  `json:"content"`
	CreatedAt string  `json:"createdAt"`
	Author    string  `json:"author"`
	Username  *string `json:"username"`
}

type membershipRow struct {
	TopicKey string `json:"topic_key"`
	UserID   string `json:"user_id"`
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
	Username    *string `json:"username"`
}

type Client struct {
	membersEndpoint        string
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
		return nil, errors.New("supabase editor discussion client configuration is invalid")
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
		membersEndpoint:        projectURL + "/rest/v1/discussion_members",
		messagesEndpoint:       projectURL + "/rest/v1/discussion_messages",
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
	membershipQuery := url.Values{}
	membershipQuery.Set("select", "topic_key,user_id")
	membershipQuery.Set("topic_key", "eq."+topic)
	membershipQuery.Set("user_id", "eq."+subject)
	membershipQuery.Set("limit", "1")
	var memberships []membershipRow
	if err := c.getJSON(ctx, c.membersEndpoint+"?"+membershipQuery.Encode(), accessToken, &memberships); err != nil {
		return Discussion{}, ErrUnavailable
	}
	if len(memberships) != 1 || memberships[0].TopicKey != topic || strings.ToLower(memberships[0].UserID) != subject {
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

	profiles := make(map[string]publicProfileRow, len(authorIDs))
	for start := 0; start < len(authorIDs); start += 50 {
		end := start + 50
		if end > len(authorIDs) {
			end = len(authorIDs)
		}
		profileQuery := url.Values{}
		profileQuery.Set("select", "id,display_name,username")
		profileQuery.Set("id", "in.("+strings.Join(authorIDs[start:end], ",")+")")
		profileQuery.Set("limit", "50")
		var batch []publicProfileRow
		if err := c.getJSON(ctx, c.publicProfilesEndpoint+"?"+profileQuery.Encode(), accessToken, &batch); err != nil || len(batch) > end-start {
			return Discussion{}, ErrUnavailable
		}
		for _, profile := range batch {
			id := strings.ToLower(profile.ID)
			if !uuidPattern.MatchString(id) || !authorSet[id] || !validOptionalText(profile.DisplayName, 120) || !validOptionalText(profile.Username, 80) {
				return Discussion{}, ErrUnavailable
			}
			profiles[id] = profile
		}
	}

	messages := make([]Message, 0, len(rows))
	for index := len(rows) - 1; index >= 0; index-- {
		row := rows[index]
		profile := profiles[strings.ToLower(row.AuthorID)]
		author := "Участник KIVRONIX"
		if profile.DisplayName != nil && *profile.DisplayName != "" {
			author = *profile.DisplayName
		}
		username := profile.Username
		if username != nil && *username == "" {
			username = nil
		}
		messages = append(messages, Message{ID: row.ID, Content: row.Content, CreatedAt: row.CreatedAt, Author: author, Username: username})
	}
	return Discussion{Messages: messages}, nil
}

func (c *Client) CreateMessage(ctx context.Context, accessToken, subject string, input CreateMessageInput) (CreateMessageResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	input.ID = strings.ToLower(strings.TrimSpace(input.ID))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) || !ValidCreateMessage(input) {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if err := c.requireMembership(ctx, accessToken, subject); err != nil {
		return CreateMessageResponse{}, err
	}
	payload, err := json.Marshal(messageRow{ID: input.ID, TopicKey: topic, AuthorID: subject, Content: input.Content, Status: "published"})
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

func (c *Client) requireMembership(ctx context.Context, accessToken, subject string) error {
	query := url.Values{}
	query.Set("select", "topic_key,user_id")
	query.Set("topic_key", "eq."+topic)
	query.Set("user_id", "eq."+subject)
	query.Set("limit", "1")
	var rows []membershipRow
	if err := c.getJSON(ctx, c.membersEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil {
		return ErrUnavailable
	}
	if len(rows) != 1 || rows[0].TopicKey != topic || strings.ToLower(rows[0].UserID) != subject {
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
