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
	"github.com/eliseyiudin05-eng/edita/backend/internal/jobs"
)

type fakeJobStore struct {
	view            jobs.View
	created         jobs.Job
	accepted        jobs.AcceptResult
	err             error
	createInput     jobs.CreateInput
	jobID, editorID string
	applyJobID      string
}

func (s *fakeJobStore) Get(context.Context, string, string) (jobs.View, error) {
	return s.view, s.err
}

func (s *fakeJobStore) Create(_ context.Context, _, _ string, input jobs.CreateInput) (jobs.Job, error) {
	s.createInput = input
	return s.created, s.err
}

func (s *fakeJobStore) Apply(_ context.Context, _, _, jobID string) error {
	s.applyJobID = jobID
	return s.err
}

func (s *fakeJobStore) Accept(_ context.Context, _, _, jobID, editorID string) (jobs.AcceptResult, error) {
	s.jobID, s.editorID = jobID, editorID
	return s.accepted, s.err
}

func jobTestHandler(store *fakeJobStore) http.Handler {
	return New(Options{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth: claimsVerifier{claims: auth.Claims{
			Subject: "123e4567-e89b-12d3-a456-426614174000",
			Role:    "authenticated",
		}},
		Jobs: store,
	})
}

func TestJobCreateValidatesAndDelegates(t *testing.T) {
	store := &fakeJobStore{created: jobs.Job{ID: "223e4567-e89b-12d3-a456-426614174000", Title: "Монтаж ролика"}}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/jobs", strings.NewReader(`{"action":"create","title":"  Монтаж ролика  ","description":"Нужен динамичный вертикальный ролик.","paymentPoints":500}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	jobTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusCreated || store.createInput.Title != "Монтаж ролика" || store.createInput.PaymentPoints != 500 || !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("status=%d body=%s store=%+v", res.Code, res.Body.String(), store)
	}
}

func TestJobApplyUsesValidatedID(t *testing.T) {
	store := &fakeJobStore{}
	const id = "223e4567-e89b-12d3-a456-426614174000"
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/jobs", strings.NewReader(`{"action":"apply","jobId":"`+id+`"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	jobTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusOK || store.applyJobID != id {
		t.Fatalf("status=%d body=%s jobID=%q", res.Code, res.Body.String(), store.applyJobID)
	}
}

func TestJobAcceptMapsInsufficientBalance(t *testing.T) {
	store := &fakeJobStore{err: jobs.ErrInsufficient}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/jobs", strings.NewReader(`{"action":"accept","jobId":"223e4567-e89b-12d3-a456-426614174000","editorId":"323e4567-e89b-12d3-a456-426614174000"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	jobTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusConflict || !strings.Contains(res.Body.String(), `"code":"insufficient_points"`) {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
}
