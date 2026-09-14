package mailer

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestSendAuthLinkKeepsTokenInHTTPSBody(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(request.Body)
		if request.URL.String() != "https://api.resend.com/emails" || request.Header.Get("Authorization") != "Bearer re_test_key" {
			t.Fatalf("unexpected request: %s %s", request.URL, request.Header.Get("Authorization"))
		}
		if !strings.Contains(string(body), "reset-password?token=opaque-token") {
			t.Fatalf("missing recovery link: %s", body)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"id":"message-id"}`)), Header: make(http.Header)}, nil
	})}
	sender, err := NewResend("re_test_key", "KIVRONIX <no-reply@auth.kivronix.ru>", "https://kivronix.ru", client)
	if err != nil {
		t.Fatal(err)
	}
	if err := sender.SendAuthLink(context.Background(), "user@example.com", "recover_password", "opaque-token"); err != nil {
		t.Fatal(err)
	}
}
