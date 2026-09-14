package finance

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxProviderResponseBytes = 256 * 1024

var providerIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,128}$`)

type YooKassa struct {
	endpoint   string
	shopID     string
	secret     string
	httpClient *http.Client
}

type yooPayment struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Amount struct {
		Value    string `json:"value"`
		Currency string `json:"currency"`
	} `json:"amount"`
	Confirmation struct {
		ConfirmationURL string `json:"confirmation_url"`
	} `json:"confirmation"`
	Metadata map[string]string `json:"metadata"`
}

func NewYooKassa(shopID, secret string, httpClient *http.Client) (*YooKassa, error) {
	return newYooKassa("https://api.yookassa.ru/v3", shopID, secret, httpClient)
}

func newYooKassa(endpoint, shopID, secret string, httpClient *http.Client) (*YooKassa, error) {
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	shopID, secret = strings.TrimSpace(shopID), strings.TrimSpace(secret)
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || shopID == "" || secret == "" || strings.ContainsAny(shopID+secret, "\r\n") {
		return nil, errors.New("YooKassa configuration is invalid")
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	client := *httpClient
	if client.Timeout <= 0 {
		client.Timeout = 10 * time.Second
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &YooKassa{endpoint: endpoint, shopID: shopID, secret: secret, httpClient: &client}, nil
}

func (client *YooKassa) CreatePayment(ctx context.Context, topup TopupRecord, returnURL string) (ProviderPayment, error) {
	if client == nil || !uuidPattern.MatchString(topup.ID) || topup.Points < 100 || topup.AmountCents != topup.Points*105 {
		return ProviderPayment{}, ErrProvider
	}
	payload := map[string]any{
		"amount":       map[string]string{"value": centsString(topup.AmountCents), "currency": "RUB"},
		"capture":      true,
		"confirmation": map[string]string{"type": "redirect", "return_url": returnURL},
		"description":  fmt.Sprintf("%d KIVRONIX Points + 5%% top-up fee", topup.Points),
		"metadata":     map[string]string{"topup_id": topup.ID, "points": strconv.FormatInt(topup.Points, 10), "topup_fee_percent": "5"},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return ProviderPayment{}, ErrProvider
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.endpoint+"/payments", bytes.NewReader(body))
	if err != nil {
		return ProviderPayment{}, ErrProvider
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotence-Key", topup.ID)
	request.SetBasicAuth(client.shopID, client.secret)
	return client.do(request)
}

func (client *YooKassa) GetPayment(ctx context.Context, paymentID string) (ProviderPayment, error) {
	if client == nil || !providerIDPattern.MatchString(paymentID) {
		return ProviderPayment{}, ErrProvider
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.endpoint+"/payments/"+url.PathEscape(paymentID), nil)
	if err != nil {
		return ProviderPayment{}, ErrProvider
	}
	request.SetBasicAuth(client.shopID, client.secret)
	return client.do(request)
}

func (client *YooKassa) do(request *http.Request) (ProviderPayment, error) {
	response, err := client.httpClient.Do(request)
	if err != nil {
		return ProviderPayment{}, ErrProvider
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 || response.ContentLength > maxProviderResponseBytes {
		return ProviderPayment{}, ErrProvider
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxProviderResponseBytes+1))
	if err != nil || len(body) > maxProviderResponseBytes {
		return ProviderPayment{}, ErrProvider
	}
	var raw yooPayment
	if err := json.Unmarshal(body, &raw); err != nil || !providerIDPattern.MatchString(raw.ID) {
		return ProviderPayment{}, ErrProvider
	}
	amount, err := parseCents(raw.Amount.Value)
	if err != nil {
		return ProviderPayment{}, ErrProvider
	}
	return ProviderPayment{ID: raw.ID, Status: raw.Status, AmountCents: amount, Currency: raw.Amount.Currency,
		ConfirmationURL: raw.Confirmation.ConfirmationURL, Metadata: raw.Metadata}, nil
}

func parseCents(value string) (int64, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 2 || len(parts[1]) != 2 {
		return 0, ErrProvider
	}
	rubles, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || rubles < 0 || rubles > (1<<63-1)/100 {
		return 0, ErrProvider
	}
	kopecks, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || kopecks < 0 || kopecks > 99 {
		return 0, ErrProvider
	}
	return rubles*100 + kopecks, nil
}

func centsString(cents int64) string {
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}
