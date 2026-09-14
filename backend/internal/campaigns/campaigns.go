package campaigns

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
	ErrUnavailable = errors.New("campaign service unavailable")
	ErrForbidden   = errors.New("campaign operation forbidden")
	ErrNotFound    = errors.New("campaign not found")
	ErrInvalid     = errors.New("invalid campaign input")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Business struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Verified          bool   `json:"verified"`
	VerificationLevel string `json:"verification_level"`
}

type Editor struct {
	DisplayName *string `json:"display_name"`
	Username    *string `json:"username"`
}

type Application struct {
	ID           string  `json:"id"`
	EditorID     string  `json:"editor_id"`
	PortfolioURL *string `json:"portfolio_url"`
	Note         *string `json:"note"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"created_at"`
	Editor       *Editor `json:"editor,omitempty"`
}

type Campaign struct {
	ID           string        `json:"id"`
	Title        string        `json:"title"`
	Goal         string        `json:"goal"`
	Requirements string        `json:"requirements"`
	BudgetText   string        `json:"budget_text"`
	CreatorSlots int64         `json:"creator_slots"`
	ContentTypes []string      `json:"content_types"`
	Status       string        `json:"status"`
	EndsAt       *string       `json:"ends_at"`
	CreatedAt    string        `json:"created_at"`
	Business     *Business     `json:"business,omitempty"`
	MyStatus     *string       `json:"myStatus,omitempty"`
	Applications []Application `json:"applications,omitempty"`
}

type LeagueRow struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Level        string `json:"verification_level"`
	Score        int64  `json:"score"`
	Campaigns    int64  `json:"campaigns"`
	Applications int64  `json:"applications"`
}

type View struct {
	Mode      string      `json:"mode"`
	Business  *Business   `json:"business,omitempty"`
	Campaigns []Campaign  `json:"campaigns"`
	League    []LeagueRow `json:"league"`
}

type CreateInput struct {
	Title        string   `json:"title"`
	Goal         string   `json:"goal"`
	Requirements string   `json:"requirements"`
	BudgetText   string   `json:"budgetText"`
	CreatorSlots int64    `json:"creatorSlots"`
	ContentTypes []string `json:"contentTypes"`
	EndsAt       *string  `json:"endsAt"`
}

type ApplyInput struct {
	CampaignID   string `json:"campaignId"`
	PortfolioURL string `json:"portfolioUrl"`
	Note         string `json:"note"`
}

type Store interface {
	Get(context.Context, string, string) (View, error)
	Create(context.Context, string, string, CreateInput) (Campaign, error)
	Apply(context.Context, string, string, ApplyInput) error
	SetApplicationStatus(context.Context, string, string, string, string) (string, error)
}

func NormalizeCreate(input CreateInput) (CreateInput, error) {
	input.Title = bounded(input.Title, 120)
	input.Goal = bounded(input.Goal, 500)
	input.Requirements = bounded(input.Requirements, 2000)
	input.BudgetText = bounded(input.BudgetText, 120)
	if utf8.RuneCountInString(input.Title) < 3 || utf8.RuneCountInString(input.Goal) < 3 || input.BudgetText == "" || input.CreatorSlots < 1 || input.CreatorSlots > 100 || len(input.ContentTypes) > 8 {
		return CreateInput{}, ErrInvalid
	}
	for index, item := range input.ContentTypes {
		item = bounded(item, 40)
		if item == "" {
			return CreateInput{}, ErrInvalid
		}
		input.ContentTypes[index] = item
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

func NormalizeApply(input ApplyInput) (ApplyInput, error) {
	input.CampaignID = strings.ToLower(strings.TrimSpace(input.CampaignID))
	input.PortfolioURL = bounded(input.PortfolioURL, 500)
	input.Note = bounded(input.Note, 1000)
	if !uuidPattern.MatchString(input.CampaignID) {
		return ApplyInput{}, ErrInvalid
	}
	if input.PortfolioURL != "" {
		parsed, err := url.Parse(input.PortfolioURL)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
			return ApplyInput{}, ErrInvalid
		}
	}
	return input, nil
}

func ValidStatus(value string) bool {
	return value == "shortlisted" || value == "accepted" || value == "declined"
}

func bounded(value string, max int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > max {
		value = string(runes[:max])
	}
	return value
}
