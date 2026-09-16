package portfolio

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	ErrUnavailable = errors.New("portfolio service unavailable")
	ErrForbidden   = errors.New("portfolio operation forbidden")
	ErrNotFound    = errors.New("portfolio not found")
	ErrInvalid     = errors.New("invalid portfolio input")
	ErrLimit       = errors.New("portfolio item limit reached")
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,29}$`)

type Item struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	DisplayURL    string   `json:"display_url,omitempty"`
	Tags          []string `json:"tags"`
	AIScore       *int64   `json:"ai_score"`
	StorageBacked bool     `json:"storage_backed"`
}

type PublicEditor struct {
	DisplayName string   `json:"display_name"`
	Username    string   `json:"username"`
	Level       int64    `json:"level"`
	AIScore     *int64   `json:"ai_score"`
	Skills      []string `json:"skills"`
	AvatarURL   string   `json:"avatar_url,omitempty"`
	SchoolName  string   `json:"school_name,omitempty"`
	Items       []Item   `json:"items"`
}

type CreateInput struct {
	Title              string   `json:"title"`
	VideoURL           string   `json:"videoUrl"`
	Tags               []string `json:"tags"`
	AIScore            *int64   `json:"aiScore,omitempty"`
	PublicationConsent bool     `json:"publicationConsent"`
	SourceLabel        string   `json:"sourceLabel,omitempty"`
}

type Store interface {
	GetOwn(context.Context, string, string) ([]Item, error)
	Create(context.Context, string, string, CreateInput) (Item, error)
	GetPublic(context.Context, string) (PublicEditor, error)
}

func NormalizeCreate(input CreateInput) (CreateInput, error) {
	input.Title = bounded(input.Title, 160)
	input.VideoURL = strings.TrimSpace(input.VideoURL)
	if utf8.RuneCountInString(input.Title) < 2 || len(input.VideoURL) > 1000 || !safeHTTPS(input.VideoURL) || len(input.Tags) > 12 || !input.PublicationConsent {
		return CreateInput{}, ErrInvalid
	}
	input.SourceLabel=bounded(input.SourceLabel,80)
	if input.AIScore!=nil&&(*input.AIScore<0||*input.AIScore>100){return CreateInput{},ErrInvalid}
	seen := make(map[string]struct{}, len(input.Tags))
	input.Tags = sanitizeLabels(input.Tags, 12, 40, seen)
	return input, nil
}

func sanitizeLabels(values []string, limit, maxRunes int, seen map[string]struct{}) []string {
	labels := make([]string, 0, min(len(values), limit))
	for _, raw := range values {
		if len(labels) == limit {
			break
		}
		tag := bounded(raw, maxRunes)
		if tag == "" {
			continue
		}
		key := strings.ToLower(tag)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		labels = append(labels, tag)
	}
	return labels
}

func NormalizeUsername(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if !usernamePattern.MatchString(value) {
		return "", ErrInvalid
	}
	return value, nil
}

func safeDisplayURL(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 1000 || !safeHTTPS(value) {
		return ""
	}
	return value
}

func safeHTTPS(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

func bounded(value string, max int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > max {
		return string(runes[:max])
	}
	return value
}
