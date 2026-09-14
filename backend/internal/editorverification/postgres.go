package editorverification

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetVerification(ctx context.Context, _ string, subject string) (Verification, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Verification{}, ErrUnavailable
	}
	var result Verification
	var role string
	var onboarding []byte
	var emailConfirmedAt *time.Time
	var requestID, portfolioURL, sampleURL, note, status, reviewNote *string
	var createdAt, reviewedAt *time.Time
	err := r.db.QueryRow(ctx, `
		select u.email_confirmed_at,p.role,p.onboarding,p.guardian_verified,p.editor_verification_level,
		       q.id::text,q.portfolio_url,q.sample_url,q.note,q.status,q.review_note,q.created_at,q.reviewed_at
		from public.app_users u join public.profiles p on p.id=u.id
		left join lateral (
		  select id,portfolio_url,sample_url,note,status,review_note,created_at,reviewed_at
		  from public.editor_verification_requests where user_id=p.id order by created_at desc,id limit 1
		) q on true where u.id=$1`, subject).Scan(
		&emailConfirmedAt, &role, &onboarding, &result.GuardianVerified, &result.Level,
		&requestID, &portfolioURL, &sampleURL, &note, &status, &reviewNote, &createdAt, &reviewedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) || err != nil {
		return Verification{}, ErrUnavailable
	}
	if role != "editor" {
		return Verification{}, ErrForbidden
	}
	result.EmailVerified = emailConfirmedAt != nil
	result.AgeGroup = "18+"
	var values map[string]any
	if json.Unmarshal(onboarding, &values) != nil {
		return Verification{}, ErrUnavailable
	}
	if ageGroup, ok := values["ageGroup"].(string); ok && validText(ageGroup, 1, 32) {
		result.AgeGroup = ageGroup
	}
	if requestID != nil && status != nil && createdAt != nil {
		request := &VerificationRequest{ID: *requestID, PortfolioURL: portfolioURL, SampleURL: sampleURL,
			Note: note, Status: *status, ReviewNote: reviewNote, CreatedAt: createdAt.UTC().Format(time.RFC3339Nano)}
		if reviewedAt != nil {
			formatted := reviewedAt.UTC().Format(time.RFC3339Nano)
			request.ReviewedAt = &formatted
		}
		result.Request = request
	}
	return result, nil
}
