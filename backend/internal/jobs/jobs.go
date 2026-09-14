package jobs

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	ErrUnavailable  = errors.New("jobs service unavailable")
	ErrNotFound     = errors.New("job not found")
	ErrForbidden    = errors.New("job operation forbidden")
	ErrInvalid      = errors.New("invalid job input")
	ErrInsufficient = errors.New("insufficient work points")
	ErrConflict     = errors.New("job already assigned")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Business struct {
	Name              string `json:"name"`
	Verified          bool   `json:"verified"`
	VerificationLevel string `json:"verification_level"`
}

type Editor struct {
	DisplayName *string `json:"display_name"`
	Username    *string `json:"username"`
}

type Application struct {
	JobID     string  `json:"job_id"`
	EditorID  string  `json:"editor_id"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
	Editor    *Editor `json:"editor,omitempty"`
}

type Job struct {
	ID             string        `json:"id"`
	Title          string        `json:"title"`
	Description    string        `json:"description"`
	BudgetMinCents *int64        `json:"budget_min_cents"`
	BudgetMaxCents *int64        `json:"budget_max_cents"`
	PaymentPoints  int64         `json:"payment_points"`
	Status         string        `json:"status,omitempty"`
	Business       *Business     `json:"businesses,omitempty"`
	Applications   []Application `json:"applications,omitempty"`
	MyStatus       *string       `json:"my_status,omitempty"`
}

type View struct {
	Mode             string  `json:"mode"`
	BusinessID       *string `json:"businessId"`
	BusinessVerified bool    `json:"businessVerified"`
	EditorEligible   bool    `json:"editorEligible"`
	Jobs             []Job   `json:"jobs"`
}

type CreateInput struct {
	Title         string `json:"title"`
	Description   string `json:"description"`
	PaymentPoints int64  `json:"paymentPoints"`
}

type AcceptResult struct {
	OK             bool   `json:"ok"`
	ConversationID string `json:"conversationId"`
	WorkOrderID    string `json:"workOrderId"`
}

type Store interface {
	Get(context.Context, string, string) (View, error)
	Create(context.Context, string, string, CreateInput) (Job, error)
	Apply(context.Context, string, string, string) error
	Accept(context.Context, string, string, string, string) (AcceptResult, error)
}

func NormalizeCreate(input CreateInput) (CreateInput, error) {
	input.Title = bounded(input.Title, 120)
	input.Description = bounded(input.Description, 3000)
	if utf8.RuneCountInString(input.Title) < 3 || utf8.RuneCountInString(input.Description) < 10 || input.PaymentPoints < 100 || input.PaymentPoints > 10_000_000 {
		return CreateInput{}, ErrInvalid
	}
	return input, nil
}

func NormalizeUUID(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if !uuidPattern.MatchString(value) {
		return "", ErrInvalid
	}
	return value, nil
}

func bounded(value string, max int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > max {
		return string(runes[:max])
	}
	return value
}
