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
	"github.com/eliseyiudin05-eng/edita/backend/internal/portfolio"
)

type fakePortfolioStore struct {
	items    []portfolio.Item
	public   portfolio.PublicEditor
	created  portfolio.Item
	err      error
	create   portfolio.CreateInput
	username string
}

func (s *fakePortfolioStore) GetOwn(context.Context, string, string) ([]portfolio.Item, error) {
	return s.items, s.err
}

func (s *fakePortfolioStore) Create(_ context.Context, _, _ string, input portfolio.CreateInput) (portfolio.Item, error) {
	s.create = input
	return s.created, s.err
}

func (s *fakePortfolioStore) GetPublic(_ context.Context, username string) (portfolio.PublicEditor, error) {
	s.username = username
	return s.public, s.err
}

func portfolioTestHandler(store *fakePortfolioStore) http.Handler {
	return New(Options{
		Logger:    slog.New(slog.NewTextHandler(io.Discard, nil)),
		Auth:      claimsVerifier{claims: auth.Claims{Subject: "123e4567-e89b-12d3-a456-426614174000", Role: "authenticated"}},
		Portfolio: store,
	})
}

func TestPortfolioCreateValidatesAndDelegates(t *testing.T) {
	store := &fakePortfolioStore{created: portfolio.Item{ID: "223e4567-e89b-12d3-a456-426614174000", Title: "Реклама спортзала"}}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/portfolio", strings.NewReader(`{"title":"  Реклама спортзала  ","videoUrl":"https://video.example/work.mp4","tags":[" Реклама ","реклама","спорт"],"publicationConsent":true}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	portfolioTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusCreated || store.create.Title != "Реклама спортзала" || len(store.create.Tags) != 2 || !strings.Contains(res.Body.String(), `"ok":true`) {
		t.Fatalf("status=%d body=%s input=%+v", res.Code, res.Body.String(), store.create)
	}
}

func TestPortfolioCreateRejectsUnsafeURL(t *testing.T) {
	store := &fakePortfolioStore{}
	req := httptest.NewRequest(http.MethodPost, "/v1/marketplace/portfolio", strings.NewReader(`{"title":"Работа","videoUrl":"javascript:alert(1)"}`))
	req.Header.Set("Authorization", "Bearer token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	portfolioTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), `"code":"invalid_portfolio_item"`) {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
}

func TestPublicPortfolioNormalizesUsernameWithoutAuthentication(t *testing.T) {
	store := &fakePortfolioStore{public: portfolio.PublicEditor{DisplayName: "Редактор", Username: "editor.one", Skills: []string{}, Items: []portfolio.Item{}}}
	req := httptest.NewRequest(http.MethodGet, "/v1/public/editors/Editor.One", nil)
	res := httptest.NewRecorder()
	portfolioTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusOK || store.username != "editor.one" || !strings.Contains(res.Body.String(), `"username":"editor.one"`) {
		t.Fatalf("status=%d body=%s username=%q", res.Code, res.Body.String(), store.username)
	}
}

func TestPublicPortfolioMapsNotFound(t *testing.T) {
	store := &fakePortfolioStore{err: portfolio.ErrNotFound}
	req := httptest.NewRequest(http.MethodGet, "/v1/public/editors/missing", nil)
	res := httptest.NewRecorder()
	portfolioTestHandler(store).ServeHTTP(res, req)
	if res.Code != http.StatusNotFound || !strings.Contains(res.Body.String(), `"code":"editor_not_found"`) {
		t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
	}
}
