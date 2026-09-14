package portfolio

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxItemsPerEditor = 100

type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetOwn(ctx context.Context, _ string, subject string) ([]Item, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || subject == "" {
		return nil, ErrUnavailable
	}
	var role string
	if err := r.db.QueryRow(ctx, `select role from public.profiles where id=$1`, subject).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, ErrUnavailable
	}
	if role != "editor" {
		return nil, ErrForbidden
	}
	return r.items(ctx, subject)
}

func (r *PostgresRepository) Create(ctx context.Context, _ string, subject string, input CreateInput) (Item, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || subject == "" {
		return Item{}, ErrUnavailable
	}
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return Item{}, ErrUnavailable
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()
	var role string
	if err = tx.QueryRow(ctx, `select role from public.profiles where id=$1 for update`, subject).Scan(&role); errors.Is(err, pgx.ErrNoRows) {
		return Item{}, ErrNotFound
	} else if err != nil {
		return Item{}, ErrUnavailable
	}
	if role != "editor" {
		return Item{}, ErrForbidden
	}
	var count int64
	if err = tx.QueryRow(ctx, `select count(*) from public.portfolio_items where editor_id=$1`, subject).Scan(&count); err != nil {
		return Item{}, ErrUnavailable
	}
	if count >= maxItemsPerEditor {
		return Item{}, ErrLimit
	}
	var item Item
	if err = tx.QueryRow(ctx, `insert into public.portfolio_items(editor_id,title,video_url,tags) values($1,$2,$3,$4) returning id::text,title,tags,ai_score`, subject, input.Title, input.VideoURL, input.Tags).Scan(&item.ID, &item.Title, &item.Tags, &item.AIScore); err != nil {
		return Item{}, ErrUnavailable
	}
	item.DisplayURL = input.VideoURL
	if item.Tags == nil {
		item.Tags = []string{}
	}
	if err = tx.Commit(ctx); err != nil {
		return Item{}, ErrUnavailable
	}
	return item, nil
}

func (r *PostgresRepository) GetPublic(ctx context.Context, username string) (PublicEditor, error) {
	if r == nil || r.db == nil {
		return PublicEditor{}, ErrUnavailable
	}
	var editorID, avatarURL string
	var result PublicEditor
	err := r.db.QueryRow(ctx, `select id::text,left(coalesce(display_name,'Монтажёр KIVRONIX'),120),username::text,level,ai_score,skills[1:20],left(coalesce(avatar_url,''),1001),case when show_school_publicly then left(coalesce(school_name,''),160) else '' end from public.profiles where role='editor' and username=$1`, username).Scan(&editorID, &result.DisplayName, &result.Username, &result.Level, &result.AIScore, &result.Skills, &avatarURL, &result.SchoolName)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicEditor{}, ErrNotFound
	}
	if err != nil {
		return PublicEditor{}, ErrUnavailable
	}
	result.AvatarURL = safeDisplayURL(avatarURL)
	result.Skills = sanitizeLabels(result.Skills, 20, 40, make(map[string]struct{}, len(result.Skills)))
	result.Items, err = r.items(ctx, editorID)
	if err != nil {
		return PublicEditor{}, err
	}
	return result, nil
}

func (r *PostgresRepository) items(ctx context.Context, editorID string) ([]Item, error) {
	rows, err := r.db.Query(ctx, `select id::text,left(title,160),left(video_url,1001),tags[1:12],ai_score,object_id is not null from public.portfolio_items where editor_id=$1 order by created_at desc,id limit $2`, editorID, maxItemsPerEditor)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer rows.Close()
	items := []Item{}
	for rows.Next() {
		var item Item
		var rawURL string
		if rows.Scan(&item.ID, &item.Title, &rawURL, &item.Tags, &item.AIScore, &item.StorageBacked) != nil {
			return nil, ErrUnavailable
		}
		item.DisplayURL = safeDisplayURL(rawURL)
		item.Tags = sanitizeLabels(item.Tags, 12, 40, make(map[string]struct{}, len(item.Tags)))
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, ErrUnavailable
	}
	return items, nil
}
