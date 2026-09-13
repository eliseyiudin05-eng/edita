package business

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

var ErrUnavailable = errors.New("business service unavailable")

const maxResponseBytes = 32 * 1024

var (
	uuidPattern   = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	statusPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)
)

type Verification struct {
	Business BusinessProfile      `json:"business"`
	Request  *VerificationRequest `json:"request"`
}

type BusinessProfile struct {
	Name               string  `json:"name"`
	Verified           bool    `json:"verified"`
	VerificationStatus string  `json:"verification_status"`
	VerificationLevel  string  `json:"verification_level"`
	VerificationNote   *string `json:"verification_note"`
	VerifiedAt         *string `json:"verified_at"`
}

type VerificationRequest struct {
	RequestedLevel string  `json:"requested_level"`
	Status         string  `json:"status"`
	ReviewNote     *string `json:"review_note"`
	CreatedAt      string  `json:"created_at"`
}

type businessRow struct {
	ID                 string  `json:"id"`
	OwnerID            string  `json:"owner_id"`
	Name               string  `json:"name"`
	Verified           bool    `json:"verified"`
	VerificationStatus *string `json:"verification_status"`
	VerificationLevel  *string `json:"verification_level"`
	VerificationNote   *string `json:"verification_note"`
	VerifiedAt         *string `json:"verified_at"`
}

type requestRow struct {
	ID             string  `json:"id"`
	BusinessID     string  `json:"business_id"`
	RequestedLevel string  `json:"requested_level"`
	Status         string  `json:"status"`
	ReviewNote     *string `json:"review_note"`
	CreatedAt      string  `json:"created_at"`
}

type Client struct {
	businessesEndpoint string
	requestsEndpoint   string
	publishableKey     string
	httpClient         *http.Client
}

func NewClient(projectURL, publishableKey string, httpClient *http.Client) (*Client, error) {
	projectURL = strings.TrimRight(strings.TrimSpace(projectURL), "/")
	publishableKey = strings.TrimSpace(publishableKey)
	if projectURL == "" || publishableKey == "" {
		return nil, errors.New("supabase business client configuration is incomplete")
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
		businessesEndpoint: projectURL + "/rest/v1/businesses",
		requestsEndpoint:   projectURL + "/rest/v1/business_verification_requests",
		publishableKey:     publishableKey,
		httpClient:         &client,
	}, nil
}

func (c *Client) GetVerification(ctx context.Context, accessToken, subject string) (Verification, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if c == nil || strings.TrimSpace(accessToken) == "" || !uuidPattern.MatchString(subject) {
		return Verification{}, ErrUnavailable
	}

	businessQuery := url.Values{}
	businessQuery.Set("select", "id,owner_id,name,verified,verification_status,verification_level,verification_note,verified_at")
	businessQuery.Set("owner_id", "eq."+subject)
	businessQuery.Set("limit", "1")
	var businesses []businessRow
	if err := c.getJSON(ctx, c.businessesEndpoint+"?"+businessQuery.Encode(), accessToken, &businesses); err != nil || len(businesses) != 1 {
		return Verification{}, ErrUnavailable
	}
	business := businesses[0]
	if !validBusiness(business) || strings.ToLower(business.OwnerID) != subject {
		return Verification{}, ErrUnavailable
	}

	requestQuery := url.Values{}
	requestQuery.Set("select", "id,business_id,requested_level,status,review_note,created_at")
	requestQuery.Set("business_id", "eq."+strings.ToLower(business.ID))
	requestQuery.Set("order", "created_at.desc,id.asc")
	requestQuery.Set("limit", "1")
	var requests []requestRow
	if err := c.getJSON(ctx, c.requestsEndpoint+"?"+requestQuery.Encode(), accessToken, &requests); err != nil || len(requests) > 1 {
		return Verification{}, ErrUnavailable
	}

	result := Verification{Business: BusinessProfile{
		Name: business.Name, Verified: business.Verified, VerificationStatus: normalizedStatus(business.VerificationStatus),
		VerificationLevel: normalizedStatus(business.VerificationLevel), VerificationNote: business.VerificationNote, VerifiedAt: business.VerifiedAt,
	}}
	if len(requests) == 1 {
		row := requests[0]
		if !validRequest(row) || !strings.EqualFold(row.BusinessID, business.ID) {
			return Verification{}, ErrUnavailable
		}
		result.Request = &VerificationRequest{
			RequestedLevel: row.RequestedLevel, Status: row.Status, ReviewNote: row.ReviewNote, CreatedAt: row.CreatedAt,
		}
	}
	return result, nil
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

func validBusiness(row businessRow) bool {
	return uuidPattern.MatchString(strings.ToLower(row.ID)) && uuidPattern.MatchString(strings.ToLower(row.OwnerID)) &&
		validText(row.Name, 1, 180) && validOptionalStatus(row.VerificationStatus) && validOptionalStatus(row.VerificationLevel) &&
		validOptionalText(row.VerificationNote, 1000) && validOptionalTime(row.VerifiedAt)
}

func validRequest(row requestRow) bool {
	return uuidPattern.MatchString(strings.ToLower(row.ID)) && uuidPattern.MatchString(strings.ToLower(row.BusinessID)) &&
		validStatus(row.RequestedLevel) && validStatus(row.Status) && validOptionalText(row.ReviewNote, 1000) && validTime(row.CreatedAt)
}

func validStatus(value string) bool          { return statusPattern.MatchString(value) }
func validOptionalStatus(value *string) bool { return value == nil || validStatus(*value) }
func normalizedStatus(value *string) string {
	if value == nil {
		return "unverified"
	}
	return *value
}
func validText(value string, minimum, maximum int) bool {
	length := utf8.RuneCountInString(value)
	return length >= minimum && length <= maximum
}
func validOptionalText(value *string, maximum int) bool {
	return value == nil || utf8.RuneCountInString(*value) <= maximum
}
func validOptionalTime(value *string) bool { return value == nil || validTime(*value) }
func validTime(value string) bool {
	if len(value) > 64 {
		return false
	}
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}
