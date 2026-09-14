package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eliseyiudin05-eng/edita/backend/internal/auth"
	"github.com/eliseyiudin05-eng/edita/backend/internal/finance"
)

type fakeFinanceStore struct {
	wallet        finance.Wallet
	payouts       finance.Payouts
	err           error
	createdAmount int64
	token         string
	subject       string
}

func (store *fakeFinanceStore) GetWallet(_ context.Context, token, subject string) (finance.Wallet, error) {
	store.token = token
	store.subject = subject
	return store.wallet, store.err
}

func (store *fakeFinanceStore) ListPayouts(_ context.Context, token, subject string) (finance.Payouts, error) {
	store.token = token
	store.subject = subject
	return store.payouts, store.err
}

func (store *fakeFinanceStore) CreatePayout(_ context.Context, token, subject string, amountCents int64) error {
	store.token = token
	store.subject = subject
	store.createdAmount = amountCents
	return store.err
}

func financeTestHandler(store *fakeFinanceStore) http.Handler {
	return New(Options{
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:    claimsVerifier{claims: auth.Claims{Subject: "00000000-0000-4000-8000-000000000001", Role: "authenticated"}},
		Finance: store,
	})
}

func TestFinanceWalletRequiresAuthAndReturnsBoundedContract(t *testing.T) {
	store := &fakeFinanceStore{wallet: finance.Wallet{Available: 900, Reserved: 100, TopupFeePercent: 5}}
	handler := financeTestHandler(store)

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/v1/finance/wallet", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized status = %d, want %d", unauthorized.Code, http.StatusUnauthorized)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/finance/wallet", nil)
	request.Header.Set("Authorization", "Bearer access-token")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"available":900`) || store.token != "access-token" {
		t.Fatalf("unexpected response: status=%d body=%s store=%+v", response.Code, response.Body.String(), store)
	}
}

func TestFinancePayoutCreatesCentsAndReturnsHistory(t *testing.T) {
	store := &fakeFinanceStore{payouts: finance.Payouts{Requests: []finance.PayoutRequest{}}}
	request := httptest.NewRequest(http.MethodPost, "/v1/finance/payouts", strings.NewReader(`{"amountRub":250}`))
	request.Header.Set("Authorization", "Bearer access-token")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	financeTestHandler(store).ServeHTTP(response, request)
	if response.Code != http.StatusOK || store.createdAmount != 25_000 || !strings.Contains(response.Body.String(), `"requests":[]`) {
		t.Fatalf("unexpected response: status=%d body=%s store=%+v", response.Code, response.Body.String(), store)
	}
}

func TestFinancePayoutMapsBusinessConflicts(t *testing.T) {
	for _, test := range []struct {
		err  error
		code string
	}{{finance.ErrPending, "payout_pending"}, {finance.ErrInsufficient, "insufficient_earnings"}} {
		store := &fakeFinanceStore{err: test.err}
		request := httptest.NewRequest(http.MethodPost, "/v1/finance/payouts", strings.NewReader(`{"amountRub":100}`))
		request.Header.Set("Authorization", "Bearer access-token")
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		financeTestHandler(store).ServeHTTP(response, request)
		if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), `"code":"`+test.code+`"`) {
			t.Fatalf("error %v: status=%d body=%s", test.err, response.Code, response.Body.String())
		}
	}
}
