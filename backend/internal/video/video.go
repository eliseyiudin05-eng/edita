package video

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/eliseyiudin05-eng/edita/backend/internal/contentguard"
)

var (
	ErrUnavailable = errors.New("video service unavailable")
	ErrForbidden   = errors.New("video operation forbidden")
	ErrNotFound    = errors.New("video not found")
	ErrInvalid     = errors.New("invalid video input")
	ErrConflict    = errors.New("video operation conflict")
)

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type Author struct {
	DisplayName string `json:"display_name"`
	Username    string `json:"username,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
	Kind        string `json:"kind"`
	Verified    bool   `json:"verified"`
}

type Comment struct {
	ID        string `json:"id"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
	Author    Author `json:"author"`
}

type Clip struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	DisplayURL    string    `json:"display_url,omitempty"`
	Tags          []string  `json:"tags"`
	AIScore       *int64    `json:"ai_score"`
	StorageBacked bool      `json:"storage_backed"`
	CreatedAt     string    `json:"created_at"`
	Author        Author    `json:"author"`
	Likes         int64     `json:"likes"`
	CommentsCount int64     `json:"comments_count"`
	Shares        int64     `json:"shares"`
	Liked         bool      `json:"liked"`
	Following     bool      `json:"following"`
	Own           bool      `json:"own"`
	CTA           string    `json:"cta,omitempty"`
	Comments      []Comment `json:"comments"`
}

type Feed struct {
	ViewerKind string `json:"viewer_kind"`
	Clips      []Clip `json:"clips"`
}

type ActionInput struct {
	Action  string `json:"action"`
	VideoID string `json:"videoId"`
	ID      string `json:"id"`
	Body    string `json:"body"`
}

type ActionResult struct {
	OK             bool   `json:"ok"`
	Active         *bool  `json:"active,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
}

type Competition struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Brief        string `json:"brief"`
	PrizeText    string `json:"prize_text"`
	EndsAt       string `json:"ends_at"`
	HostName     string `json:"host_name"`
	Entries      int64  `json:"entries"`
	Owned        bool   `json:"owned"`
	Entered      bool   `json:"entered"`
	CanEnter     bool   `json:"can_enter"`
	CanCreate    bool   `json:"can_create"`
	WinningTitle string `json:"winning_title,omitempty"`
}

type CompetitionInput struct {
	Action        string `json:"action"`
	CompetitionID string `json:"competitionId"`
	VideoID       string `json:"videoId"`
	Title         string `json:"title"`
	Brief         string `json:"brief"`
	PrizeText     string `json:"prizeText"`
	EndsAt        string `json:"endsAt"`
}

type Store interface {
	Feed(context.Context, string) (Feed, error)
	Act(context.Context, string, ActionInput) (ActionResult, error)
	Competitions(context.Context, string) ([]Competition, error)
	CompetitionAction(context.Context, string, CompetitionInput) error
}

func NormalizeAction(input ActionInput) (ActionInput, error) {
	input.Action = strings.ToLower(strings.TrimSpace(input.Action))
	input.VideoID = normalizeID(input.VideoID)
	input.ID = normalizeID(input.ID)
	input.Body = strings.TrimSpace(input.Body)
	if !uuidPattern.MatchString(input.VideoID) {
		return ActionInput{}, ErrInvalid
	}
	switch input.Action {
	case "like", "follow", "open_chat":
		if input.ID != "" || input.Body != "" {
			return ActionInput{}, ErrInvalid
		}
	case "share":
		if !uuidPattern.MatchString(input.ID) || input.Body != "" {
			return ActionInput{}, ErrInvalid
		}
	case "comment":
		if !uuidPattern.MatchString(input.ID) || utf8.RuneCountInString(input.Body) < 1 || utf8.RuneCountInString(input.Body) > 500 || contentguard.ContainsContact(input.Body) {
			return ActionInput{}, ErrInvalid
		}
	default:
		return ActionInput{}, ErrInvalid
	}
	return input, nil
}

func NormalizeCompetition(input CompetitionInput) (CompetitionInput, error) {
	input.Action = strings.ToLower(strings.TrimSpace(input.Action))
	input.CompetitionID = normalizeID(input.CompetitionID)
	input.VideoID = normalizeID(input.VideoID)
	input.Title = bounded(input.Title, 120)
	input.Brief = bounded(input.Brief, 3000)
	input.PrizeText = bounded(input.PrizeText, 300)
	if input.Action == "enter" {
		if !uuidPattern.MatchString(input.CompetitionID) || !uuidPattern.MatchString(input.VideoID) {
			return CompetitionInput{}, ErrInvalid
		}
		return input, nil
	}
	if input.Action != "create" || utf8.RuneCountInString(input.Title) < 3 || utf8.RuneCountInString(input.Brief) < 10 || utf8.RuneCountInString(input.PrizeText) < 2 {
		return CompetitionInput{}, ErrInvalid
	}
	ends, err := time.Parse(time.RFC3339, strings.TrimSpace(input.EndsAt))
	if err != nil || !ends.After(time.Now().UTC().Add(time.Hour)) || ends.After(time.Now().UTC().AddDate(1, 0, 0)) {
		return CompetitionInput{}, ErrInvalid
	}
	input.EndsAt = ends.UTC().Format(time.RFC3339)
	return input, nil
}

func SafeURL(value string) string {
	value = strings.TrimSpace(value)
	parsed, err := url.Parse(value)
	if err != nil || len(value) > 1000 || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return ""
	}
	return value
}

func normalizeID(value string) string { return strings.ToLower(strings.TrimSpace(value)) }
func bounded(value string, max int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > max {
		runes = runes[:max]
	}
	return string(runes)
}
