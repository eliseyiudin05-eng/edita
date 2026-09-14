package portfolio

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeCreate(t *testing.T) {
	input, err := NormalizeCreate(CreateInput{
		Title:    "  Реклама спортзала  ",
		VideoURL: " https://video.example/work.mp4 ",
		Tags:     []string{" Реклама ", "спорт", "реклама", ""},
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Title != "Реклама спортзала" || input.VideoURL != "https://video.example/work.mp4" || len(input.Tags) != 2 || input.Tags[0] != "Реклама" {
		t.Fatalf("unexpected input: %+v", input)
	}
	longTitle := strings.Repeat("я", 161)
	boundedInput, err := NormalizeCreate(CreateInput{Title: longTitle, VideoURL: "https://example.com/video"})
	if err != nil || len([]rune(boundedInput.Title)) != 160 {
		t.Fatalf("title len=%d err=%v", len([]rune(boundedInput.Title)), err)
	}
}

func TestNormalizeCreateRejectsUnsafeInput(t *testing.T) {
	for _, input := range []CreateInput{
		{Title: "x", VideoURL: "https://example.com/video"},
		{Title: "Работа", VideoURL: "http://example.com/video"},
		{Title: "Работа", VideoURL: "javascript:alert(1)"},
		{Title: "Работа", VideoURL: "https://user:pass@example.com/video"},
		{Title: "Работа", VideoURL: "https://example.com/video", Tags: make([]string, 13)},
	} {
		if _, err := NormalizeCreate(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("expected ErrInvalid for %+v, got %v", input, err)
		}
	}
}

func TestNormalizeUsername(t *testing.T) {
	username, err := NormalizeUsername("  Editor.One  ")
	if err != nil || username != "editor.one" {
		t.Fatalf("username=%q err=%v", username, err)
	}
	for _, value := range []string{"ab", "editor one", "редактор", "../admin"} {
		if _, err := NormalizeUsername(value); !errors.Is(err, ErrInvalid) {
			t.Fatalf("expected invalid username for %q, got %v", value, err)
		}
	}
}
