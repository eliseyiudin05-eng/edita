package practice

import (
	"context"
	"encoding/json"
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

func (r *PostgresRepository) GetSession(ctx context.Context, _ string, subject string) (ReadResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) {
		return ReadResponse{}, ErrUnavailable
	}
	var scenario string
	var messagesJSON, resultJSON []byte
	var updatedAt time.Time
	err := r.db.QueryRow(ctx, `select scenario, messages, result, updated_at from public.practice_sessions where user_id=$1`, subject).
		Scan(&scenario, &messagesJSON, &resultJSON, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ReadResponse{Session: nil}, nil
	}
	if err != nil {
		return ReadResponse{}, ErrUnavailable
	}
	session := StoredSession{Session: Session{Scenario: scenario, Messages: []Message{}}, UpdatedAt: updatedAt.UTC().Format(time.RFC3339Nano)}
	if json.Unmarshal(messagesJSON, &session.Messages) != nil {
		return ReadResponse{}, ErrUnavailable
	}
	if len(resultJSON) > 0 && string(resultJSON) != "null" {
		var result Result
		if json.Unmarshal(resultJSON, &result) != nil {
			return ReadResponse{}, ErrUnavailable
		}
		session.Result = &result
	}
	if !ValidSession(session.Session) {
		return ReadResponse{}, ErrUnavailable
	}
	return ReadResponse{Session: &session}, nil
}

func (r *PostgresRepository) SaveSession(ctx context.Context, _ string, subject string, session Session) (SaveResponse, error) {
	subject = strings.ToLower(strings.TrimSpace(subject))
	if r == nil || r.db == nil || !uuidPattern.MatchString(subject) || !ValidSession(session) {
		return SaveResponse{}, ErrUnavailable
	}
	if session.Messages == nil {
		session.Messages = []Message{}
	}
	messages, err := json.Marshal(session.Messages)
	if err != nil {
		return SaveResponse{}, ErrUnavailable
	}
	var result *string
	if session.Result != nil {
		encoded, encodeErr := json.Marshal(session.Result)
		if encodeErr != nil {
			return SaveResponse{}, ErrUnavailable
		}
		value := string(encoded)
		result = &value
	}
	_, err = r.db.Exec(ctx, `
		insert into public.practice_sessions(user_id,scenario,messages,result,updated_at)
		values($1,$2,$3::jsonb,$4::jsonb,now())
		on conflict(user_id) do update set scenario=excluded.scenario,messages=excluded.messages,result=excluded.result,updated_at=now()`,
		subject, session.Scenario, string(messages), result)
	if err != nil {
		return SaveResponse{}, ErrUnavailable
	}
	return SaveResponse{OK: true}, nil
}
