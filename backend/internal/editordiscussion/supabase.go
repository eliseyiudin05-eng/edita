package editordiscussion

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
	ErrForbidden   = errors.New("editor discussion forbidden")
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
	CreatedAt string `json:"created_at"`
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
