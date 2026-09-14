package aifeedback

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

func (r *PostgresRepository) SaveFeedback(ctx context.Context, _ string, subject string, feedback Feedback) (Response, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	feedback.MessageID = strings.ToLower(strings.TrimSpace(feedback.MessageID))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !ValidFeedback(feedback) {
		return Response{}, ErrUnavailable
	}
	var conversationID string
	err := r.db.QueryRow(ctx, `
		select conversation_id::text from public.ai_messages
		where id=$1 and user_id=$2 and role='assistant'`, feedback.MessageID, subject).Scan(&conversationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Response{}, ErrNotFound
	}
	if err != nil {
		return Response{}, ErrUnavailable
	}
	var helpful bool
	var comment *string
	err = r.db.QueryRow(ctx, `
		insert into public.ai_feedback(user_id,conversation_id,message_id,rating,reason,helpful,comment)
		values($1,$2,$3,case when $4 then 1 else -1 end,$5,$4,$5)
		on conflict(user_id,message_id) where message_id is not null do update
		set conversation_id=excluded.conversation_id,rating=excluded.rating,reason=excluded.reason,
		    helpful=excluded.helpful,comment=excluded.comment,created_at=now()
		returning helpful,comment`, subject, conversationID, feedback.MessageID, *feedback.Helpful, feedback.Comment).Scan(&helpful, &comment)
	if err != nil || helpful != *feedback.Helpful || !sameComment(comment, feedback.Comment) {
		return Response{}, ErrUnavailable
	}
	return Response{OK: true, Queued: false}, nil
}
