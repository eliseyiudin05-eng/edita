package rewards

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxRedemptions = 20

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetDashboard(ctx context.Context, _ string, subject string, enabled bool) (Dashboard, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Dashboard{}, ErrUnavailable
	}
	result := Dashboard{Rewards: AvailableRewards(), Redemptions: []Redemption{}, RedemptionEnabled: enabled}
	if err := r.db.QueryRow(ctx, `
		select referral_code::text,referral_points,
		       (select count(*) from public.referrals where referrer_id=$1 and status='qualified'),
		       (select count(*) from public.referrals where referrer_id=$1 and status='pending')
		from public.profiles where id=$1`, subject).Scan(&result.Code, &result.Points, &result.Qualified, &result.Pending); errors.Is(err, pgx.ErrNoRows) {
		return Dashboard{}, ErrNotFound
	} else if err != nil {
		return Dashboard{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select id::text,points_spent,reward,created_at from public.referral_redemptions
		where user_id=$1 order by created_at desc,id limit $2`, subject, maxRedemptions)
	if err != nil {
		return Dashboard{}, ErrUnavailable
	}
	defer rows.Close()
	for rows.Next() {
		var item Redemption
		var createdAt time.Time
		if rows.Scan(&item.ID, &item.PointsSpent, &item.Reward, &createdAt) != nil {
			return Dashboard{}, ErrUnavailable
		}
		item.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		result.Redemptions = append(result.Redemptions, item)
	}
	if rows.Err() != nil {
		return Dashboard{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) QualifyReferral(ctx context.Context, _ string, subject string) (Qualification, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Qualification{}, ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Qualification{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var confirmed bool
	if err = tx.QueryRow(ctx, `select email_confirmed_at is not null from public.app_users where id=$1`, subject).Scan(&confirmed); errors.Is(err, pgx.ErrNoRows) {
		return Qualification{}, ErrNotFound
	} else if err != nil {
		return Qualification{}, ErrUnavailable
	}
	if !confirmed {
		return Qualification{OK: true, Reason: "email"}, tx.Commit(ctx)
	}
	var referralID, status, referrerID string
	err = tx.QueryRow(ctx, `
		select id::text,status,referrer_id::text from public.referrals
		where referred_id=$1 order by created_at,id limit 1 for update`, subject).Scan(&referralID, &status, &referrerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Qualification{OK: true}, tx.Commit(ctx)
	}
	if err != nil {
		return Qualification{}, ErrUnavailable
	}
	if status != "pending" {
		return Qualification{OK: true, Qualified: status == "qualified"}, tx.Commit(ctx)
	}
	var completed int64
	if err = tx.QueryRow(ctx, `select count(*) from public.lesson_progress where user_id=$1 and status='completed'`, subject).Scan(&completed); err != nil {
		return Qualification{}, ErrUnavailable
	}
	if completed < 3 {
		return Qualification{OK: true, Reason: "lessons", Completed: completed}, tx.Commit(ctx)
	}
	// Lock both profiles in a stable order before writing either balance.
	rows, err := tx.Query(ctx, `select id from public.profiles where id in ($1,$2) order by id for update`, referrerID, subject)
	if err != nil {
		return Qualification{}, ErrUnavailable
	}
	locked := 0
	for rows.Next() {
		var lockedID string
		if rows.Scan(&lockedID) != nil {
			rows.Close()
			return Qualification{}, ErrUnavailable
		}
		locked++
	}
	rows.Close()
	if rows.Err() != nil || locked != 2 {
		return Qualification{}, ErrUnavailable
	}
	command, err := tx.Exec(ctx, `update public.referrals set status='qualified',qualified_at=now() where id=$1 and status='pending'`, referralID)
	if err != nil || command.RowsAffected() != 1 {
		return Qualification{}, ErrUnavailable
	}
	for _, award := range []struct {
		userID string
		points int64
		xp     int64
	}{{referrerID, 500, 150}, {subject, 250, 50}} {
		command, err = tx.Exec(ctx, `
			insert into public.referral_reward_events(referral_id,user_id,points)
			values($1,$2,$3) on conflict(referral_id,user_id) do nothing`, referralID, award.userID, award.points)
		if err != nil {
			return Qualification{}, ErrUnavailable
		}
		if command.RowsAffected() == 1 {
			if _, err = tx.Exec(ctx, `update public.profiles set referral_points=referral_points+$2,xp=xp+$3 where id=$1`, award.userID, award.points, award.xp); err != nil {
				return Qualification{}, ErrUnavailable
			}
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Qualification{}, ErrUnavailable
	}
	return Qualification{OK: true, Qualified: true, Completed: completed}, nil
}

func (r *PostgresRepository) Redeem(ctx context.Context, _ string, subject, reward string) (RedemptionResult, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	reward = strings.TrimSpace(reward)
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return RedemptionResult{}, ErrUnavailable
	}
	if !ValidReward(reward) {
		return RedemptionResult{}, ErrUnknown
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return RedemptionResult{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var role string
	var points int64
	var expiresAt *time.Time
	if err = tx.QueryRow(ctx, `select role,referral_points,plan_expires_at from public.profiles where id=$1 for update`, subject).Scan(&role, &points, &expiresAt); errors.Is(err, pgx.ErrNoRows) {
		return RedemptionResult{}, ErrNotFound
	} else if err != nil {
		return RedemptionResult{}, ErrUnavailable
	}
	if role != "editor" {
		return RedemptionResult{}, ErrForbidden
	}
	if points < CreatorPlusCost {
		return RedemptionResult{}, ErrInsufficient
	}
	base := time.Now().UTC()
	if expiresAt != nil && expiresAt.After(base) {
		base = expiresAt.UTC()
	}
	newExpiry := base.AddDate(0, 0, 30)
	if _, err = tx.Exec(ctx, `update public.profiles set referral_points=referral_points-$2,plan='creator_plus',plan_expires_at=$3 where id=$1`, subject, CreatorPlusCost, newExpiry); err != nil {
		return RedemptionResult{}, ErrUnavailable
	}
	if _, err = tx.Exec(ctx, `insert into public.referral_redemptions(user_id,points_spent,reward) values($1,$2,$3)`, subject, CreatorPlusCost, reward); err != nil {
		return RedemptionResult{}, ErrUnavailable
	}
	if err = tx.Commit(ctx); err != nil {
		return RedemptionResult{}, ErrUnavailable
	}
	return RedemptionResult{OK: true, Reward: reward, PlanExpiresAt: newExpiry.Format(time.RFC3339Nano)}, nil
}
