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
	maxConversations = 100
	maxResponseBytes = 256 * 1024
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Thread struct {
	ViewerID     string       `json:"viewerId"`
	Conversation Conversation `json:"conversation"`
	Messages     []Message    `json:"messages"`
}

type ConversationList struct {
	ViewerID      string                `json:"viewerId"`
	Conversations []ConversationSummary `json:"conversations"`
}

type ConversationSummary struct {
	ID            string     `json:"id"`
	Side          string     `json:"side"`
	SourceKind    string     `json:"source_kind"`
	SourceID      string     `json:"source_id"`
	OtherName     string     `json:"otherName"`
	OtherUsername *string    `json:"otherUsername"`
	OtherAvatar   *string    `json:"otherAvatar"`
	CompanyName   string     `json:"company_name"`
	Title         string     `json:"title"`
	Status        string     `json:"status"`
	LastMessageAt string     `json:"last_message_at"`
	CreatedAt     string     `json:"created_at"`
	WorkOrder     *WorkOrder `json:"workOrder"`
}

type WorkOrder struct {
	ID                string       `json:"id"`
	GrossPoints       int64        `json:"gross_points"`
	EditorPoints      int64        `json:"editor_points"`
	PlatformFeePoints int64        `json:"platform_fee_points"`
	Status            string       `json:"status"`
	Deliverable       *Deliverable `json:"work_order_deliverables"`
}

type Deliverable struct {
	PreviewName  string `json:"preview_name"`
	OriginalName string `json:"original_name"`
	SubmittedAt  string `json:"submitted_at"`
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

type conversationListRow struct {
	ID              string `json:"id"`
	EditorID        string `json:"editor_id"`
	BusinessOwnerID string `json:"business_owner_id"`
	SourceKind      string `json:"source_kind"`
	SourceID        string `json:"source_id"`
	CompanyName     string `json:"company_name"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	LastMessageAt   string `json:"last_message_at"`
	CreatedAt       string `json:"created_at"`
}

type profileRow struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"display_name"`
	Username    *string `json:"username"`
	AvatarURL   *string `json:"avatar_url"`
}

type workOrderRow struct {
	ID                string          `json:"id"`
	ConversationID    string          `json:"conversation_id"`
	CustomerID        string          `json:"customer_id"`
	EditorID          string          `json:"editor_id"`
	GrossPoints       int64           `json:"gross_points"`
	EditorPoints      int64           `json:"editor_points"`
	PlatformFeePoints int64           `json:"platform_fee_points"`
	Status            string          `json:"status"`
	Deliverables      json.RawMessage `json:"work_order_deliverables"`
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
	profilesEndpoint      string
	workOrdersEndpoint    string
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
		profilesEndpoint:      projectURL + "/rest/v1/public_profiles",
		workOrdersEndpoint:    projectURL + "/rest/v1/work_orders",
		publishableKey:        publishableKey,
		httpClient:            &client,
	}, nil
}

func (c *Client) ListConversations(ctx context.Context, accessToken, subject string) (ConversationList, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !validUUID(subject) {
		return ConversationList{}, ErrUnavailable
	}

	query := url.Values{}
	query.Set("select", "id,editor_id,business_owner_id,source_kind,source_id,company_name,title,status,last_message_at,created_at")
	query.Set("or", "(editor_id.eq."+subject+",business_owner_id.eq."+subject+")")
	query.Set("order", "last_message_at.desc,id.asc")
	query.Set("limit", "100")
	var rows []conversationListRow
	if err := c.getJSON(ctx, c.conversationsEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil || len(rows) > maxConversations {
		return ConversationList{}, ErrUnavailable
	}
	if len(rows) == 0 {
		return ConversationList{ViewerID: subject, Conversations: []ConversationSummary{}}, nil
	}

	conversationIDs := make([]string, 0, len(rows))
	editorIDs := make([]string, 0, len(rows))
	conversationByID := make(map[string]conversationListRow, len(rows))
	seenEditors := make(map[string]bool)
	for _, row := range rows {
		conversationID := strings.ToLower(row.ID)
		if !validConversationListRow(row) || (strings.ToLower(row.EditorID) != subject && strings.ToLower(row.BusinessOwnerID) != subject) || conversationByID[conversationID].ID != "" {
			return ConversationList{}, ErrUnavailable
		}
		conversationIDs = append(conversationIDs, conversationID)
		conversationByID[conversationID] = row
		editorID := strings.ToLower(row.EditorID)
		if editorID != subject && !seenEditors[editorID] {
			seenEditors[editorID] = true
			editorIDs = append(editorIDs, editorID)
		}
	}

	profiles, err := c.getProfiles(ctx, accessToken, editorIDs)
	if err != nil {
		return ConversationList{}, err
	}
	orders, err := c.getWorkOrders(ctx, accessToken, subject, conversationIDs, conversationByID)
	if err != nil {
		return ConversationList{}, err
	}

	result := make([]ConversationSummary, 0, len(rows))
	for _, row := range rows {
		side := "company"
		otherName := "Монтажёр"
		var otherUsername, otherAvatar *string
		if strings.EqualFold(row.EditorID, subject) {
			side = "editor"
			otherName = row.CompanyName
		} else if profile, ok := profiles[strings.ToLower(row.EditorID)]; ok {
			if profile.DisplayName != nil && strings.TrimSpace(*profile.DisplayName) != "" {
				otherName = *profile.DisplayName
			}
			otherUsername = profile.Username
			otherAvatar = profile.AvatarURL
		}
		result = append(result, ConversationSummary{
			ID: strings.ToLower(row.ID), Side: side, SourceKind: row.SourceKind, SourceID: strings.ToLower(row.SourceID),
			OtherName: otherName, OtherUsername: otherUsername, OtherAvatar: otherAvatar, CompanyName: row.CompanyName,
			Title: row.Title, Status: row.Status, LastMessageAt: row.LastMessageAt, CreatedAt: row.CreatedAt,
			WorkOrder: orders[strings.ToLower(row.ID)],
		})
	}
	return ConversationList{ViewerID: subject, Conversations: result}, nil
}

func (c *Client) getProfiles(ctx context.Context, accessToken string, ids []string) (map[string]profileRow, error) {
	if len(ids) == 0 {
		return map[string]profileRow{}, nil
	}
	query := url.Values{}
	query.Set("select", "id,display_name,username,avatar_url")
	query.Set("id", "in.("+strings.Join(ids, ",")+")")
	query.Set("limit", "100")
	var rows []profileRow
	if err := c.getJSON(ctx, c.profilesEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil || len(rows) > maxConversations {
		return nil, ErrUnavailable
	}
	result := make(map[string]profileRow, len(rows))
	for _, row := range rows {
		id := strings.ToLower(row.ID)
		if !validProfile(row) || !seen(ids, id) || result[id].ID != "" {
			return nil, ErrUnavailable
		}
		result[id] = row
	}
	return result, nil
}

func (c *Client) getWorkOrders(ctx context.Context, accessToken, subject string, ids []string, conversations map[string]conversationListRow) (map[string]*WorkOrder, error) {
	query := url.Values{}
	query.Set("select", "id,conversation_id,customer_id,editor_id,gross_points,editor_points,platform_fee_points,status,work_order_deliverables(preview_name,original_name,submitted_at)")
	query.Set("conversation_id", "in.("+strings.Join(ids, ",")+")")
	query.Set("or", "(customer_id.eq."+subject+",editor_id.eq."+subject+")")
	query.Set("limit", "100")
	var rows []workOrderRow
	if err := c.getJSON(ctx, c.workOrdersEndpoint+"?"+query.Encode(), accessToken, &rows); err != nil || len(rows) > maxConversations {
		return nil, ErrUnavailable
	}
	result := make(map[string]*WorkOrder, len(rows))
	for _, row := range rows {
		conversationID := strings.ToLower(row.ConversationID)
		conversation, exists := conversations[conversationID]
		if !exists || !validWorkOrder(row, subject, conversation) || !seen(ids, conversationID) || result[conversationID] != nil {
			return nil, ErrUnavailable
		}
		deliverable, err := parseDeliverable(row.Deliverables)
		if err != nil {
			return nil, ErrUnavailable
		}
		result[conversationID] = &WorkOrder{
			ID: strings.ToLower(row.ID), GrossPoints: row.GrossPoints, EditorPoints: row.EditorPoints,
			PlatformFeePoints: row.PlatformFeePoints, Status: row.Status, Deliverable: deliverable,
		}
	}
	return result, nil
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

func validConversationListRow(value conversationListRow) bool {
	return validUUID(value.ID) && validUUID(value.EditorID) && validUUID(value.BusinessOwnerID) &&
		!strings.EqualFold(value.EditorID, value.BusinessOwnerID) && validUUID(value.SourceID) &&
		validText(value.CompanyName, 1, 160) && validText(value.Title, 1, 180) &&
		(value.Status == "active" || value.Status == "closed") && validSourceKind(value.SourceKind) &&
		validTime(value.LastMessageAt) && validTime(value.CreatedAt)
}

func validProfile(value profileRow) bool {
	return validUUID(value.ID) && validOptionalText(value.DisplayName, 120) &&
		validOptionalText(value.Username, 80) && validOptionalText(value.AvatarURL, 1000)
}

func validWorkOrder(value workOrderRow, subject string, conversation conversationListRow) bool {
	return validUUID(value.ID) && validUUID(value.ConversationID) && validUUID(value.CustomerID) && validUUID(value.EditorID) &&
		(strings.EqualFold(value.CustomerID, subject) || strings.EqualFold(value.EditorID, subject)) &&
		strings.EqualFold(value.CustomerID, conversation.BusinessOwnerID) && strings.EqualFold(value.EditorID, conversation.EditorID) &&
		value.GrossPoints > 0 && value.EditorPoints > 0 && value.PlatformFeePoints >= 0 &&
		value.EditorPoints+value.PlatformFeePoints == value.GrossPoints &&
		(value.Status == "funded" || value.Status == "submitted" || value.Status == "completed" || value.Status == "disputed" || value.Status == "cancelled")
}

func parseDeliverable(raw json.RawMessage) (*Deliverable, error) {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == "[]" {
		return nil, nil
	}
	var value Deliverable
	if raw[0] == '[' {
		var values []Deliverable
		if json.Unmarshal(raw, &values) != nil || len(values) > 1 {
			return nil, ErrUnavailable
		}
		if len(values) == 0 {
			return nil, nil
		}
		value = values[0]
	} else if json.Unmarshal(raw, &value) != nil {
		return nil, ErrUnavailable
	}
	if !validText(value.PreviewName, 1, 160) || !validText(value.OriginalName, 1, 160) || !validTime(value.SubmittedAt) {
		return nil, ErrUnavailable
	}
	return &value, nil
}

func validSourceKind(value string) bool {
	return value == "campaign" || value == "challenge" || value == "job" || value == "kivronix_contest"
}

func validOptionalText(value *string, maximum int) bool {
	return value == nil || utf8.ValidString(*value) && utf8.RuneCountInString(*value) <= maximum
}

func seen(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
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
