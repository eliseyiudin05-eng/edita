package businessdiscussion

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

func (r *PostgresRepository) GetDiscussion(ctx context.Context, _ string, subject string) (Discussion, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return Discussion{}, ErrUnavailable
	}
	if err := r.requireBusiness(ctx, subject); err != nil {
		return Discussion{}, err
	}
	rows, err := r.db.Query(ctx, `
		with recent as (
		  select id,author_id,content,created_at from public.business_discussion_messages
		  where topic_key=$1 and status='published' and author_id is not null
		  order by created_at desc,id limit $2
		)
		select r.id::text,r.content,r.created_at,coalesce(nullif(p.display_name,''),'Компания KIVRONIX')
		from recent r left join public.profiles p on p.id=r.author_id order by r.created_at,r.id`, topic, maxMessages)
	if err != nil {
		return Discussion{}, ErrUnavailable
	}
	defer rows.Close()
	result := Discussion{Messages: []Message{}}
	for rows.Next() {
		var message Message
		var createdAt time.Time
		if rows.Scan(&message.ID, &message.Content, &createdAt, &message.Author) != nil {
			return Discussion{}, ErrUnavailable
		}
		message.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		result.Messages = append(result.Messages, message)
	}
	if rows.Err() != nil {
		return Discussion{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) CreateMessage(ctx context.Context, _ string, subject string, input CreateMessageInput) (CreateMessageResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	input.ID = strings.ToLower(strings.TrimSpace(input.ID))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !ValidCreateMessage(input) {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if err := r.requireBusiness(ctx, subject); err != nil {
		return CreateMessageResponse{}, err
	}
	_, err := r.db.Exec(ctx, `
		insert into public.business_discussion_messages(id,topic_key,author_id,content,status)
		values($1,$2,$3,$4,'published') on conflict(id) do nothing`, input.ID, topic, subject, input.Content)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	var authorID, content, topicKey, status string
	err = r.db.QueryRow(ctx, `select author_id::text,content,topic_key,status from public.business_discussion_messages where id=$1`, input.ID).
		Scan(&authorID, &content, &topicKey, &status)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if !strings.EqualFold(authorID, subject) || content != input.Content || topicKey != topic || status != "published" {
		return CreateMessageResponse{}, ErrConflict
	}
	return CreateMessageResponse{OK: true}, nil
}

func (r *PostgresRepository) requireBusiness(ctx context.Context, subject string) error {
	var role string
	err := r.db.QueryRow(ctx, `select role from public.profiles where id=$1`, subject).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && role != "business") {
		return ErrForbidden
	}
	if err != nil {
		return ErrUnavailable
	}
	return nil
}
