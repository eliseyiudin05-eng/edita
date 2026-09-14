package guardianverification

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

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
	var role string
	var onboarding []byte
	var result Verification
	var requestStatus, reviewNote *string
	err := r.db.QueryRow(ctx, `
		select p.role,p.onboarding,p.guardian_verified,q.status,q.review_note
		from public.profiles p
		left join lateral (
		  select status,review_note from public.guardian_verification_requests
		  where user_id=p.id order by created_at desc,id limit 1
		) q on true where p.id=$1`, subject).Scan(&role, &onboarding, &result.Verified, &requestStatus, &reviewNote)
	if errors.Is(err, pgx.ErrNoRows) || err != nil {
		return Verification{}, ErrUnavailable
	}
	ageGroup := "18+"
	var values map[string]any
	if json.Unmarshal(onboarding, &values) != nil {
		return Verification{}, ErrUnavailable
	}
	if value, ok := values["ageGroup"].(string); ok && validText(value, 1, 32) {
		ageGroup = value
	}
	result.Needed = role == "editor" && ageGroup != "18+"
	if result.Needed && requestStatus != nil {
		result.Request = &VerificationRequest{Status: *requestStatus, ReviewNote: reviewNote}
	}
	return result, nil
}
