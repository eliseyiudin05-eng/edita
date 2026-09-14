package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Resend struct {
	apiKey  string
	from    string
	siteURL string
	client  *http.Client
}

func NewResend(apiKey, from, siteURL string, client *http.Client) (*Resend, error) {
	parsed, err := url.Parse(strings.TrimRight(siteURL, "/"))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return nil, errors.New("public site URL must be HTTPS")
	}
	if !strings.HasPrefix(apiKey, "re_") || strings.TrimSpace(from) == "" {
		return nil, errors.New("Resend configuration is incomplete")
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Resend{apiKey: apiKey, from: from, siteURL: parsed.String(), client: client}, nil
}

func (r *Resend) SendAuthLink(ctx context.Context, to, purpose, token string) error {
	path := "/confirm-email"
	subject := "Подтвердите email KIVRONIX"
	button := "Подтвердить email"
	if purpose == "recover_password" {
		path = "/reset-password"
		subject = "Восстановление пароля KIVRONIX"
		button = "Создать новый пароль"
	}
	link := r.siteURL + path + "?token=" + url.QueryEscape(token)
	body, err := json.Marshal(map[string]any{
		"from": r.from, "to": []string{to}, "subject": subject,
		"html": "<p>Запрос для аккаунта KIVRONIX.</p><p><a href=\"" + html.EscapeString(link) + "\">" + html.EscapeString(button) + "</a></p><p>Ссылка действует один час и используется один раз.</p>",
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+r.apiKey)
	request.Header.Set("Content-Type", "application/json")
	response, err := r.client.Do(request)
	if err != nil {
		return fmt.Errorf("send auth email: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return fmt.Errorf("Resend returned status %d", response.StatusCode)
	}
	return nil
}
