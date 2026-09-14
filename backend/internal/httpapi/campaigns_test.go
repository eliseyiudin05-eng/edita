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
	"github.com/eliseyiudin05-eng/edita/backend/internal/campaigns"
)

type fakeCampaignStore struct {
	view                  campaigns.View
	created               campaigns.Campaign
	err                   error
	createInput           campaigns.CreateInput
	applyInput            campaigns.ApplyInput
	applicationID, status string
}

func (s *fakeCampaignStore) Get(context.Context, string, string) (campaigns.View, error) {
	return s.view, s.err
}
func (s *fakeCampaignStore) Create(_ context.Context, _, _ string, input campaigns.CreateInput) (campaigns.Campaign, error) {
	s.createInput = input
	return s.created, s.err
}
func (s *fakeCampaignStore) Apply(_ context.Context, _, _ string, input campaigns.ApplyInput) error {
	s.applyInput = input
	return s.err
}
func (s *fakeCampaignStore) SetApplicationStatus(_ context.Context, _, _, id, status string) (string, error) {
	s.applicationID, s.status = id, status
	return "00000000-0000-4000-8000-000000000099", s.err
}

func campaignTestHandler(store *fakeCampaignStore) http.Handler {
	return New(Options{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Auth: claimsVerifier{claims: auth.Claims{Subject: "00000000-0000-4000-8000-000000000001", Role: "authenticated"}}, Campaigns: store})
}

func TestCampaignCreateValidatesAndDelegates(t *testing.T) {
	store := &fakeCampaignStore{created: campaigns.Campaign{ID: "00000000-0000-4000-8000-000000000010", Title: "Запуск"}}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/campaigns", strings.NewReader(`{"action":"create","title":"Запуск","goal":"Серия роликов","budgetText":"5000 RUB","creatorSlots":3,"contentTypes":["Reels"]}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	campaignTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusCreated || store.createInput.CreatorSlots != 3 || !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("status=%d body=%s store=%+v", res.Code, res.Body.String(), store)
	}
}

func TestCampaignApplyRejectsUnsafePortfolio(t *testing.T) {
	store := &fakeCampaignStore{}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/campaigns", strings.NewReader(`{"action":"apply","campaignId":"00000000-0000-4000-8000-000000000010","portfolioUrl":"http://unsafe.example"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	campaignTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || store.applyInput.CampaignID != "" {
		t.Fatalf("status=%d body=%s store=%+v", res.Code, res.Body.String(), store)
	}
}

func TestCampaignAcceptReturnsPrivateConversation(t *testing.T) {
	store := &fakeCampaignStore{}
	id := "00000000-0000-4000-8000-000000000020"
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/campaigns", strings.NewReader(`{"action":"application_status","applicationId":"`+id+`","status":"accepted"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	campaignTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusOK || store.applicationID != id || !strings.Contains(res.Body.String(), "00000000-0000-4000-8000-000000000099") {
		t.Fatalf("status=%d body=%s store=%+v", res.Code, res.Body.String(), store)
	}
}
