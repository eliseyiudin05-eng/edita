package finance

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxPayoutRows = 20

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetWallet(ctx context.Context, _ string, subject string) (Wallet, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Wallet{}, ErrUnavailable
	}
	if _, err := r.db.Exec(ctx, `insert into public.work_wallets(user_id) values($1) on conflict(user_id) do nothing`, subject); err != nil {
		return Wallet{}, ErrUnavailable
	}
	result := Wallet{TopupFeePercent: TopupFeePercent, WorkFeePercent: WorkFeePercent}
	if err := r.db.QueryRow(ctx, `select available_points,reserved_points from public.work_wallets where user_id=$1`, subject).
		Scan(&result.Available, &result.Reserved); err != nil {
		return Wallet{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) ListPayouts(ctx context.Context, _ string, subject string) (Payouts, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Payouts{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select id::text,amount_cents,status,created_at
		from public.payout_requests where user_id=$1
		order by created_at desc,id limit $2`, subject, maxPayoutRows)
	if err != nil {
		return Payouts{}, ErrUnavailable
	}
	defer rows.Close()
	result := Payouts{Requests: []PayoutRequest{}}
	for rows.Next() {
		var item PayoutRequest
		var createdAt time.Time
		if rows.Scan(&item.ID, &item.AmountCents, &item.Status, &createdAt) != nil {
			return Payouts{}, ErrUnavailable
		}
		item.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		result.Requests = append(result.Requests, item)
	}
	if rows.Err() != nil {
		return Payouts{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) CreatePayout(ctx context.Context, _ string, subject string, amountCents int64) error {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !ValidPayoutAmount(amountCents) {
		return ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return ErrUnavailable
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var earnings int64
	if err = tx.QueryRow(ctx, `select earnings_cents from public.profiles where id=$1 for update`, subject).Scan(&earnings); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return ErrUnavailable
	}
	var active bool
	if err = tx.QueryRow(ctx, `select exists(select 1 from public.payout_requests where user_id=$1 and status in ('pending','approved'))`, subject).Scan(&active); err != nil {
		return ErrUnavailable
	}
	if active {
		return ErrPending
	}
	if earnings < amountCents {
		return ErrInsufficient
	}
	if _, err = tx.Exec(ctx, `insert into public.payout_requests(user_id,amount_cents) values($1,$2)`, subject, amountCents); err != nil {
		return ErrUnavailable
	}
	if err = tx.Commit(ctx); err != nil {
		return ErrUnavailable
	}
	return nil
}
