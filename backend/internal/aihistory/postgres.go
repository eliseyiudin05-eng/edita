package aihistory

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

func (r *PostgresRepository) GetHistory(ctx context.Context, _ string, subject, scope string) (History, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !validUUID(subject) || !ValidScope(scope) {
		return History{}, ErrUnavailable
	}
	var conversation Conversation
	var updatedAt time.Time
	err := r.db.QueryRow(ctx, `
		select id::text,scope_key,title,lesson_slug,updated_at
		from public.ai_conversations where user_id=$1 and scope_key=$2`, subject, scope).Scan(
		&conversation.ID, &conversation.ScopeKey, &conversation.Title, &conversation.LessonSlug, &updatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return History{}, ErrNotFound
	}
	if err != nil {
		return History{}, ErrUnavailable
	}
	conversation.UpdatedAt = updatedAt.UTC().Format(time.RFC3339Nano)
	rows, err := r.db.Query(ctx, `
		select id::text,role,content,created_at
		from public.ai_messages
		where conversation_id=$1 and user_id=$2 and role in ('user','assistant')
		order by created_at,id limit $3`, conversation.ID, subject, maxMessages+1)
	if err != nil {
		return History{}, ErrUnavailable
	}
	defer rows.Close()
	messages := make([]Message, 0)
	for rows.Next() {
		if len(messages) == maxMessages {
			return History{}, ErrUnavailable
		}
		var message Message
		var role string
		var createdAt time.Time
		if rows.Scan(&message.ID, &role, &message.Text, &createdAt) != nil {
			return History{}, ErrUnavailable
		}
		message.From = "user"
		if role == "assistant" {
			message.From = "ai"
		}
		message.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		messages = append(messages, message)
	}
	if rows.Err() != nil {
		return History{}, ErrUnavailable
	}
	return History{Conversation: conversation, Messages: messages}, nil
}

func (r *PostgresRepository) ClearHistory(ctx context.Context, _ string, subject, scope string) error {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !validUUID(subject) || !ValidScope(scope) {
		return ErrUnavailable
	}
	_, err := r.db.Exec(ctx, `
		delete from public.ai_messages m
		using public.ai_conversations c
		where m.conversation_id=c.id and m.user_id=$1 and c.user_id=$1 and c.scope_key=$2`, subject, scope)
	if err != nil {
		return ErrUnavailable
	}
	return nil
}

func (r *PostgresRepository) EnsureConversation(ctx context.Context, _ string, subject string, input EnsureConversationInput) (Conversation, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !validUUID(subject) || !ValidEnsureConversationInput(input) {
		return Conversation{}, ErrUnavailable
	}
	var result Conversation
	var updatedAt time.Time
	err := r.db.QueryRow(ctx, `
		insert into public.ai_conversations(user_id,scope_key,title,lesson_slug)
		values($1,$2,$3,$4)
		on conflict(user_id,scope_key) do update set updated_at=public.ai_conversations.updated_at
		returning id::text,scope_key,title,lesson_slug,updated_at`,
		subject, input.ScopeKey, input.Title, input.LessonSlug).Scan(
		&result.ID, &result.ScopeKey, &result.Title, &result.LessonSlug, &updatedAt,
	)
	if err != nil {
		return Conversation{}, ErrUnavailable
	}
	result.UpdatedAt = updatedAt.UTC().Format(time.RFC3339Nano)
	return result, nil
}
