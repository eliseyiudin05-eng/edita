package plans

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) SaveInterest(ctx context.Context, _ string, subject string, interest Interest) (Response, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !ValidInterest(interest) {
		return Response{}, ErrUnavailable
	}
	var role string
	if err := r.db.QueryRow(ctx, `select role from public.profiles where id=$1`, subject).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
		return Response{}, ErrNotFound
	} else if err != nil {
		return Response{}, ErrUnavailable
	}
	expectedAudience := "editor"
	if role == "business" {
		expectedAudience = "business"
	} else if role != "editor" && role != "admin" {
		return Response{}, ErrUnavailable
	}
	if interest.Audience != expectedAudience {
		return Response{}, ErrForbidden
	}
	var audience, plan string
	err := r.db.QueryRow(ctx, `
		insert into public.future_plan_interest(user_id,audience,wanted_plan,updated_at)
		values($1,$2,$3,now())
		on conflict(user_id) do update set audience=excluded.audience,wanted_plan=excluded.wanted_plan,updated_at=now()
		returning audience,wanted_plan`, subject, interest.Audience, interest.Plan).Scan(&audience, &plan)
	if err != nil || audience != interest.Audience || plan != interest.Plan {
		return Response{}, ErrUnavailable
	}
	return Response{OK: true, Audience: audience, Plan: plan, PaymentsEnabled: false}, nil
}
