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

func (r *PostgresRepository) BeginTopup(ctx context.Context, subject string, input TopupInput) (TopupRecord, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	input.ID = strings.ToLower(strings.TrimSpace(input.ID))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !ValidTopup(input) {
		return TopupRecord{}, ErrUnavailable
	}
	amountCents := input.Points * 105
	if _, err := r.db.Exec(ctx, `
		insert into public.point_topups(id,user_id,points,amount_cents)
		values($1,$2,$3,$4) on conflict(id) do nothing`, input.ID, subject, input.Points, amountCents); err != nil {
		return TopupRecord{}, ErrUnavailable
	}
	record, err := r.topupByID(ctx, input.ID)
	if err != nil {
		return TopupRecord{}, err
	}
	if !strings.EqualFold(record.UserID, subject) || record.Points != input.Points || record.AmountCents != amountCents {
		return TopupRecord{}, ErrConflict
	}
	return record, nil
}

func (r *PostgresRepository) AttachTopupPayment(ctx context.Context, topupID string, payment ProviderPayment) (TopupRecord, error) {
	topupID = strings.ToLower(strings.TrimSpace(topupID))
	if r == nil || r.db == nil || !uuidPattern.MatchString(topupID) || !providerIDPattern.MatchString(payment.ID) || !strings.HasPrefix(payment.ConfirmationURL, "https://") {
		return TopupRecord{}, ErrUnavailable
	}
	if _, err := r.db.Exec(ctx, `
		update public.point_topups
		set provider_payment_id=coalesce(provider_payment_id,$2),confirmation_url=$3
		where id=$1 and status='pending' and (provider_payment_id is null or provider_payment_id=$2)`, topupID, payment.ID, payment.ConfirmationURL); err != nil {
		return TopupRecord{}, ErrUnavailable
	}
	record, err := r.topupByID(ctx, topupID)
	if err != nil {
		return TopupRecord{}, err
	}
	if record.ProviderID == nil || record.ConfirmationURL == nil || *record.ProviderID != payment.ID || *record.ConfirmationURL != payment.ConfirmationURL {
		return TopupRecord{}, ErrConflict
	}
	return record, nil
}

func (r *PostgresRepository) CreditTopup(ctx context.Context, payment ProviderPayment) error {
	topupID := strings.ToLower(strings.TrimSpace(payment.Metadata["topup_id"]))
	if r == nil || r.db == nil || !providerIDPattern.MatchString(payment.ID) || !uuidPattern.MatchString(topupID) || payment.Status != "succeeded" {
		return ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return ErrUnavailable
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var userID, rowID, status string
	var points, amountCents int64
	err = tx.QueryRow(ctx, `
		select id::text,user_id::text,points,amount_cents,status
		from public.point_topups where provider_payment_id=$1 for update`, payment.ID).
		Scan(&rowID, &userID, &points, &amountCents, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return ErrUnavailable
	}
	if !strings.EqualFold(rowID, topupID) || amountCents != payment.AmountCents || payment.Currency != "RUB" {
		return ErrConflict
	}
	if status == "succeeded" {
		var credited bool
		if err = tx.QueryRow(ctx, `select exists(select 1 from public.work_point_events where topup_id=$1 and kind='topup')`, rowID).Scan(&credited); err != nil {
			return ErrUnavailable
		}
		if !credited {
			return ErrConflict
		}
		return tx.Commit(ctx)
	}
	if status != "pending" {
		return ErrConflict
	}
	if _, err = tx.Exec(ctx, `insert into public.work_wallets(user_id) values($1) on conflict(user_id) do nothing`, userID); err != nil {
		return ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `update public.work_wallets set available_points=available_points+$2,updated_at=now() where user_id=$1`, userID, points); err != nil {
		return ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `insert into public.work_point_events(user_id,topup_id,kind,points) values($1,$2,'topup',$3)`, userID, rowID, points); err != nil {
		return ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `update public.point_topups set status='succeeded',paid_at=now() where id=$1`, rowID); err != nil {
		return ErrUnavailable
	}
	if err = tx.Commit(ctx); err != nil {
		return ErrUnavailable
	}
	return nil
}

func (r *PostgresRepository) topupByID(ctx context.Context, id string) (TopupRecord, error) {
	var record TopupRecord
	err := r.db.QueryRow(ctx, `
		select id::text,user_id::text,points,amount_cents,status,provider_payment_id,confirmation_url
		from public.point_topups where id=$1`, id).
		Scan(&record.ID, &record.UserID, &record.Points, &record.AmountCents, &record.Status, &record.ProviderID, &record.ConfirmationURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return TopupRecord{}, ErrNotFound
	}
	if err != nil {
		return TopupRecord{}, ErrUnavailable
	}
	return record, nil
}
