package business

import (
	"context"
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
	var verifiedAt *time.Time
	var requestedLevel, requestStatus, reviewNote, requestID *string
	var requestCreated *time.Time
	err := r.db.QueryRow(ctx, `
		select b.name,b.verified,b.verification_status,b.verification_level,b.verification_note,b.verified_at,
		       q.id::text,q.requested_level,q.status,q.review_note,q.created_at
		from public.businesses b
		left join lateral (
		  select id,requested_level,status,review_note,created_at
		  from public.business_verification_requests where business_id=b.id
		  order by created_at desc,id limit 1
		) q on true
		where b.owner_id=$1`, subject).Scan(
		&result.Business.Name, &result.Business.Verified, &result.Business.VerificationStatus,
		&result.Business.VerificationLevel, &result.Business.VerificationNote, &verifiedAt,
		&requestID, &requestedLevel, &requestStatus, &reviewNote, &requestCreated,
	)
	if errors.Is(err, pgx.ErrNoRows) || err != nil {
		return Verification{}, ErrUnavailable
	}
	if verifiedAt != nil {
		formatted := verifiedAt.UTC().Format(time.RFC3339Nano)
		result.Business.VerifiedAt = &formatted
	}
	if requestID != nil && requestedLevel != nil && requestStatus != nil && requestCreated != nil {
		result.Request = &VerificationRequest{RequestedLevel: *requestedLevel, Status: *requestStatus,
			ReviewNote: reviewNote, CreatedAt: requestCreated.UTC().Format(time.RFC3339Nano)}
	}
	return result, nil
}
