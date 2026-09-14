package finance

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestYooKassaCreatePaymentUsesBasicAuthAndIdempotency(t *testing.T) {
	topupID := "00000000-0000-4000-8000-000000000010"
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		if !ok || username != "shop" || password != "secret" {
			t.Fatalf("unexpected Basic Auth: %q %q %v", username, password, ok)
		}
		if r.Method != http.MethodPost || r.URL.Path != "/payments" || r.Header.Get("Idempotence-Key") != topupID {
			t.Fatalf("unexpected request: method=%s path=%s idempotency=%q", r.Method, r.URL.Path, r.Header.Get("Idempotence-Key"))
		}
		var body struct {
			Amount   map[string]string `json:"amount"`
			Metadata map[string]string `json:"metadata"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Amount["value"] != "1050.00" || body.Metadata["topup_id"] != topupID {
			t.Fatalf("unexpected body: %+v error=%v", body, err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"payment-123","status":"pending","amount":{"value":"1050.00","currency":"RUB"},"confirmation":{"confirmation_url":"https://payments.example/confirm"},"metadata":{"topup_id":"` + topupID + `","points":"1000"}}`))
	}))
	defer server.Close()

	client, err := newYooKassa(server.URL, "shop", "secret", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	payment, err := client.CreatePayment(context.Background(), TopupRecord{ID: topupID, Points: 1000, AmountCents: 105000}, "https://kivronix.ru/platform#wallet")
	if err != nil || payment.ID != "payment-123" || payment.AmountCents != 105000 || payment.ConfirmationURL == "" {
		t.Fatalf("unexpected payment: %+v error=%v", payment, err)
	}
}

func TestYooKassaRejectsOversizedResponse(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Length", "300000")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	client, err := newYooKassa(server.URL, "shop", "secret", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.GetPayment(context.Background(), "payment-123"); err == nil {
		t.Fatal("expected oversized response to be rejected")
	}
}

func TestParseCentsIsExact(t *testing.T) {
	for _, test := range []struct {
		value string
		want  int64
		ok    bool
	}{{"1050.00", 105000, true}, {"0.01", 1, true}, {"10.1", 0, false}, {"1e3", 0, false}} {
		got, err := parseCents(test.value)
		if (err == nil) != test.ok || got != test.want {
			t.Fatalf("parseCents(%q) = %d, %v", test.value, got, err)
		}
	}
}
