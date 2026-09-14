package academy

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetProgress(ctx context.Context, _ string, subject string) (Progress, error) {
	if r == nil || r.db == nil || strings.TrimSpace(subject) == "" {
		return Progress{}, ErrUnavailable
	}
	rows, err := r.db.Query(ctx, `
		select l.slug, l.xp_reward
		from public.lesson_progress lp
		join public.lessons l on l.id=lp.lesson_id
		where lp.user_id=$1 and lp.status='completed'
		order by l.slug
		limit $2`, subject, maxProgressRows+1)
	if err != nil {
		return Progress{}, ErrUnavailable
	}
	defer rows.Close()
	result := Progress{CompletedSlugs: []string{}}
	for rows.Next() {
		var slug string
		var reward int64
		if rows.Scan(&slug, &reward) != nil || !slugPattern.MatchString(slug) || reward < 0 || reward > 10_000 || len(result.CompletedSlugs) == maxProgressRows {
			return Progress{}, ErrUnavailable
		}
		result.CompletedSlugs = append(result.CompletedSlugs, slug)
		result.XP += reward
	}
	if rows.Err() != nil {
		return Progress{}, ErrUnavailable
	}
	return result, nil
}
