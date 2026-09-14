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
	"github.com/eliseyiudin05-eng/edita/backend/internal/rewards"
)

type fakeRewardsStore struct {
	dashboard     rewards.Dashboard
	qualification rewards.Qualification
	redemption    rewards.RedemptionResult
	err           error
	token         string
	subject       string
	reward        string
}

func (s *fakeRewardsStore) GetDashboard(_ context.Context, token, subject string, enabled bool) (rewards.Dashboard, error) {
	s.token, s.subject = token, subject
	s.dashboard.RedemptionEnabled = enabled
	return s.dashboard, s.err
}

func (s *fakeRewardsStore) QualifyReferral(_ context.Context, token, subject string) (rewards.Qualification, error) {
	s.token, s.subject = token, subject
	return s.qualification, s.err
}

func (s *fakeRewardsStore) Redeem(_ context.Context, token, subject, reward string) (rewards.RedemptionResult, error) {
	s.token, s.subject, s.reward = token, subject, reward
	return s.redemption, s.err
}

func rewardsTestHandler(store *fakeRewardsStore, enabled bool) http.Handler {
	return New(Options{
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:    claimsVerifier{claims: auth.Claims{Subject: "00000000-0000-4000-8000-000000000001", Role: "authenticated"}},
		Rewards: store, PointsRedemptionEnabled: enabled,
	})
}

func TestReferralDashboardUsesVerifiedIdentity(t *testing.T) {
	store := &fakeRewardsStore{dashboard: rewards.Dashboard{Points: 750, Rewards: rewards.AvailableRewards(), Redemptions: []rewards.Redemption{}}}
	request := httptest.NewRequest(http.MethodGet, "/v1/social/referrals", nil)
	request.Header.Set("Authorization", "Bearer access-token")
	response := httptest.NewRecorder()
	rewardsTestHandler(store, true).ServeHTTP(response, request)
	if response.Code != http.StatusOK || store.token != "access-token" || !strings.Contains(response.Body.String(), `"points":750`) || !strings.Contains(response.Body.String(), `"redemptionEnabled":true`) {
		t.Fatalf("unexpected response: status=%d body=%s store=%+v", response.Code, response.Body.String(), store)
	}
}

func TestReferralQualificationDelegatesWithoutRequestBody(t *testing.T) {
	store := &fakeRewardsStore{qualification: rewards.Qualification{OK: true, Qualified: true, Completed: 3}}
	request := httptest.NewRequest(http.MethodPost, "/v1/referrals/qualify", nil)
	request.Header.Set("Authorization", "Bearer access-token")
	response := httptest.NewRecorder()
	rewardsTestHandler(store, false).ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"qualified":true`) {
		t.Fatalf("unexpected response: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestReferralRedemptionHonorsFeatureFlagAndMapsBalance(t *testing.T) {
	requestBody := func() *http.Request {
		r := httptest.NewRequest(http.MethodPost, "/v1/social/referrals", strings.NewReader(`{"reward":"creator_plus_30"}`))
		r.Header.Set("Authorization", "Bearer access-token")
		r.Header.Set("Content-Type", "application/json")
		return r
	}
	disabled := httptest.NewRecorder()
	rewardsTestHandler(&fakeRewardsStore{}, false).ServeHTTP(disabled, requestBody())
	if disabled.Code != http.StatusConflict || !strings.Contains(disabled.Body.String(), `"code":"redemption_disabled"`) {
		t.Fatalf("disabled response: status=%d body=%s", disabled.Code, disabled.Body.String())
	}
	store := &fakeRewardsStore{err: rewards.ErrInsufficient}
	insufficient := httptest.NewRecorder()
	rewardsTestHandler(store, true).ServeHTTP(insufficient, requestBody())
	if insufficient.Code != http.StatusConflict || store.reward != rewards.CreatorPlus30 || !strings.Contains(insufficient.Body.String(), `"code":"not_enough_points"`) {
		t.Fatalf("insufficient response: status=%d body=%s store=%+v", insufficient.Code, insufficient.Body.String(), store)
	}
}
