package editordiscussion

import (
	"context"
	"strings"
	"time"

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
	if err := r.requireMembership(ctx, subject); err != nil {
		return Discussion{}, err
	}
	rows, err := r.db.Query(ctx, `
		with recent as (
		  select id,author_id,content,created_at from public.discussion_messages
		  where topic_key=$1 and status='published' and author_id is not null
		  order by created_at desc,id limit $2
		)
		select r.id::text,r.content,r.created_at,coalesce(nullif(p.display_name,''),'Участник KIVRONIX'),nullif(p.username::text,'')
		from recent r left join public.profiles p on p.id=r.author_id order by r.created_at,r.id`, topic, maxMessages)
	if err != nil {
		return Discussion{}, ErrUnavailable
	}
	defer rows.Close()
	result := Discussion{Messages: []Message{}}
	for rows.Next() {
		var message Message
		var createdAt time.Time
		if rows.Scan(&message.ID, &message.Content, &createdAt, &message.Author, &message.Username) != nil {
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
	if err := r.requireMembership(ctx, subject); err != nil {
		return CreateMessageResponse{}, err
	}
	_, err := r.db.Exec(ctx, `
		insert into public.discussion_messages(id,topic_key,author_id,content,status)
		values($1,$2,$3,$4,'published') on conflict(id) do nothing`, input.ID, topic, subject, input.Content)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	var authorID, content, topicKey, status string
	err = r.db.QueryRow(ctx, `select author_id::text,content,topic_key,status from public.discussion_messages where id=$1`, input.ID).
		Scan(&authorID, &content, &topicKey, &status)
	if err != nil {
		return CreateMessageResponse{}, ErrUnavailable
	}
	if !strings.EqualFold(authorID, subject) || content != input.Content || topicKey != topic || status != "published" {
		return CreateMessageResponse{}, ErrConflict
	}
	return CreateMessageResponse{OK: true}, nil
}

func (r *PostgresRepository) Enroll(ctx context.Context, _ string, subject string) (EnrollResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return EnrollResponse{}, ErrUnavailable
	}
	_, err := r.db.Exec(ctx, `
		insert into public.discussion_members(user_id,topic_key,status)
		values($1,$2,'active')
		on conflict(user_id) do update set topic_key=excluded.topic_key,status='active'`, subject, topic)
	if err != nil {
		return EnrollResponse{}, ErrUnavailable
	}
	return EnrollResponse{OK: true}, nil
}

func (r *PostgresRepository) requireMembership(ctx context.Context, subject string) error {
	var exists bool
	err := r.db.QueryRow(ctx, `select exists(select 1 from public.discussion_members where user_id=$1 and topic_key=$2 and status='active')`, subject, topic).Scan(&exists)
	if err != nil {
		return ErrUnavailable
	}
	if !exists {
		return ErrForbidden
	}
	return nil
}
