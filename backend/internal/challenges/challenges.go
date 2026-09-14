package challenges

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrUnavailable = errors.New("challenge service unavailable")
	ErrForbidden   = errors.New("challenge operation forbidden")
	ErrNotFound    = errors.New("challenge not found")
	ErrInvalid     = errors.New("invalid challenge input")
	ErrConflict    = errors.New("challenge operation conflict")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Challenge struct {
	ID                string   `json:"id"`
	BusinessID        string   `json:"business_id,omitempty"`
	Brand             string   `json:"brand"`
	Title             string   `json:"title"`
	Brief             string   `json:"brief"`
	PrizeCents        int64    `json:"prize_cents"`
	PrizePoints       int64    `json:"prize_points"`
	CustomPrize       *string  `json:"custom_prize"`
	EndsAt            *string  `json:"ends_at"`
	Status            string   `json:"status"`
	SourceAssets      []string `json:"source_assets"`
	BrandVerified     bool     `json:"brand_verified"`
	VerificationLevel string   `json:"verification_level"`
}

type Submission struct {
	ID          string `json:"id"`
	ChallengeID string `json:"challenge_id"`
	EditorID    string `json:"editor_id"`
	EditorName  string `json:"editor_name"`
	StoragePath string `json:"storage_path"`
	AIScore     *int64 `json:"ai_score"`
	Status      string `json:"status"`
}

type View struct {
	Mode             string       `json:"mode"`
	BusinessID       *string      `json:"businessId"`
	BusinessVerified bool         `json:"businessVerified"`
	EditorEligible   bool         `json:"editorEligible"`
	Challenges       []Challenge  `json:"challenges"`
	Submissions      []Submission `json:"submissions"`
}

type CreateInput struct {
	Title        string   `json:"title"`
	Brief        string   `json:"brief"`
	PrizeCents   int64    `json:"prizeCents"`
	PrizePoints  int64    `json:"prizePoints"`
	CustomPrize  string   `json:"customPrize"`
	EndsAt       *string  `json:"endsAt"`
	SourceAssets []string `json:"sourceAssets"`
}

type SubmitInput struct {
	ChallengeID string `json:"challengeId"`
	ObjectID    string `json:"objectId"`
}

type WinnerResult struct {
	OK             bool   `json:"ok"`
	Status         string `json:"status"`
	ConversationID string `json:"conversationId,omitempty"`
	PointsAwarded  int64  `json:"pointsAwarded"`
	CashAwarded    int64  `json:"cashAwardedCents"`
}

type Store interface {
	Get(context.Context, string, string) (View, error)
	Create(context.Context, string, string, CreateInput) (Challenge, error)
	Submit(context.Context, string, string, SubmitInput) (Submission, error)
	SetSubmissionStatus(context.Context, string, string, string, string) (WinnerResult, error)
}

func NormalizeCreate(input CreateInput) (CreateInput, error) {
	input.Title = bounded(input.Title, 120)
	input.Brief = bounded(input.Brief, 5000)
	input.CustomPrize = bounded(input.CustomPrize, 500)
	if utf8.RuneCountInString(input.Title) < 3 || utf8.RuneCountInString(input.Brief) < 10 || input.PrizeCents < 0 || input.PrizeCents > 100_000_000 || input.PrizePoints < 0 || input.PrizePoints > 5000 || (input.PrizeCents == 0 && input.PrizePoints == 0 && input.CustomPrize == "") || len(input.SourceAssets) > 8 {
		return CreateInput{}, ErrInvalid
	}
	for index, raw := range input.SourceAssets {
		raw = bounded(raw, 1000)
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
			return CreateInput{}, ErrInvalid
		}
		input.SourceAssets[index] = raw
	}
	if input.EndsAt != nil {
		parsed, err := time.Parse(time.RFC3339, *input.EndsAt)
		if err != nil || !parsed.After(time.Now().UTC()) {
			return CreateInput{}, ErrInvalid
		}
		value := parsed.UTC().Format(time.RFC3339)
		input.EndsAt = &value
	}
	return input, nil
}

func NormalizeSubmit(input SubmitInput) (SubmitInput, error) {
	input.ChallengeID = normalizeID(input.ChallengeID)
	input.ObjectID = normalizeID(input.ObjectID)
	if !uuidPattern.MatchString(input.ChallengeID) || !uuidPattern.MatchString(input.ObjectID) {
		return SubmitInput{}, ErrInvalid
	}
	return input, nil
}

func NormalizeStatus(submissionID, status string) (string, string, error) {
	submissionID = normalizeID(submissionID)
	status = strings.ToLower(strings.TrimSpace(status))
	if !uuidPattern.MatchString(submissionID) || (status != "shortlisted" && status != "winner") {
		return "", "", ErrInvalid
	}
	return submissionID, status, nil
}

func normalizeID(value string) string { return strings.ToLower(strings.TrimSpace(value)) }

func bounded(value string, max int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > max {
		return string(runes[:max])
	}
	return value
}
