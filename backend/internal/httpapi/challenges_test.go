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
	"github.com/eliseyiudin05-eng/edita/backend/internal/challenges"
)

type fakeChallengeStore struct {
	view                        challenges.View
	created                     challenges.Challenge
	submission                  challenges.Submission
	winner                      challenges.WinnerResult
	err                         error
	createInput                 challenges.CreateInput
	submitInput                 challenges.SubmitInput
	submissionID, updatedStatus string
}

func (s *fakeChallengeStore) Get(context.Context, string, string) (challenges.View, error) {
	return s.view, s.err
}

func (s *fakeChallengeStore) Create(_ context.Context, _, _ string, input challenges.CreateInput) (challenges.Challenge, error) {
	s.createInput = input
	return s.created, s.err
}

func (s *fakeChallengeStore) Submit(_ context.Context, _, _ string, input challenges.SubmitInput) (challenges.Submission, error) {
	s.submitInput = input
	return s.submission, s.err
}

func (s *fakeChallengeStore) SetSubmissionStatus(_ context.Context, _, _, submissionID, status string) (challenges.WinnerResult, error) {
	s.submissionID, s.updatedStatus = submissionID, status
	return s.winner, s.err
}

func challengeTestHandler(store *fakeChallengeStore) http.Handler {
	return New(Options{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:       claimsVerifier{claims: auth.Claims{Subject: "123e4567-e89b-12d3-a456-426614174000", Role: "authenticated"}},
		Challenges: store,
	})
}

func TestChallengeCreateValidatesAndDelegates(t *testing.T) {
	store := &fakeChallengeStore{created: challenges.Challenge{ID: "223e4567-e89b-12d3-a456-426614174000", Title: "Рекламный ролик"}}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/challenges", strings.NewReader(`{"action":"create","title":"  Рекламный ролик  ","brief":"Создайте динамичный вертикальный ролик.","prizePoints":500}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	challengeTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusCreated || store.createInput.Title != "Рекламный ролик" || store.createInput.PrizePoints != 500 || !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("status=%d body=%s store=%+v", res.Code, res.Body.String(), store)
	}
}

func TestChallengeSubmitUsesValidatedObject(t *testing.T) {
	store := &fakeChallengeStore{}
	const challengeID = "223e4567-e89b-12d3-a456-426614174000"
	const objectID = "323e4567-e89b-12d3-a456-426614174000"
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/challenges", strings.NewReader(`{"action":"submit","challengeId":"`+challengeID+`","objectId":"`+objectID+`"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	challengeTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusOK || store.submitInput.ChallengeID != challengeID || store.submitInput.ObjectID != objectID {
		t.Fatalf("status=%d body=%s input=%+v", res.Code, res.Body.String(), store.submitInput)
	}
}

func TestChallengeWinnerReturnsLedgerResult(t *testing.T) {
	store := &fakeChallengeStore{winner: challenges.WinnerResult{OK: true, Status: "winner", ConversationID: "423e4567-e89b-12d3-a456-426614174000", PointsAwarded: 500, CashAwarded: 25_000}}
	const submissionID = "323e4567-e89b-12d3-a456-426614174000"
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/challenges", strings.NewReader(`{"action":"submission_status","submissionId":"`+submissionID+`","status":"winner"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	challengeTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusOK || store.submissionID != submissionID || store.updatedStatus != "winner" || !strings.Contains(res.Body.String(), `"cashAwardedCents":25000`) {
		t.Fatalf("status=%d body=%s store=%+v", res.Code, res.Body.String(), store)
	}
}

func TestChallengeWinnerMapsConflict(t *testing.T) {
	store := &fakeChallengeStore{err: challenges.ErrConflict}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/challenges", strings.NewReader(`{"action":"submission_status","submissionId":"323e4567-e89b-12d3-a456-426614174000","status":"winner"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	challengeTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusConflict || !strings.Contains(res.Body.String(), `"code":"winner_conflict"`) {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
}
