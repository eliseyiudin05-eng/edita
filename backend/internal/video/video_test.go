package video

import (
	"testing"
	"time"
)

func TestNormalizeAction(t *testing.T) {
	videoID := "123e4567-e89b-42d3-a456-426614174000"
	commentID := "123e4567-e89b-42d3-a456-426614174001"
	if _, err := NormalizeAction(ActionInput{Action: "comment", VideoID: videoID, ID: commentID, Body: "Сильный хук!"}); err != nil {
		t.Fatal(err)
	}
	if _, err := NormalizeAction(ActionInput{Action: "comment", VideoID: videoID, ID: commentID, Body: "Пиши @outside"}); err == nil {
		t.Fatal("contact must be rejected")
	}
	if _, err := NormalizeAction(ActionInput{Action: "like", VideoID: "bad"}); err == nil {
		t.Fatal("invalid id accepted")
	}
}

func TestNormalizeCompetition(t *testing.T) {
	input := CompetitionInput{Action: "create", Title: "Новый формат", Brief: "Снимите вертикальный ролик по заданию.", PrizeText: "Совместный выпуск", EndsAt: time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339)}
	if _, err := NormalizeCompetition(input); err != nil {
		t.Fatal(err)
	}
	input.EndsAt = time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339)
	if _, err := NormalizeCompetition(input); err == nil {
		t.Fatal("too-soon deadline accepted")
	}
}

func TestSafeURL(t *testing.T) {
	if SafeURL("https://cdn.example/video.mp4") == "" {
		t.Fatal("safe URL rejected")
	}
	for _, value := range []string{"http://example.test/a", "javascript:alert(1)", "https://u:p@example.test/a"} {
		if SafeURL(value) != "" {
			t.Fatalf("unsafe URL accepted: %s", value)
		}
	}
}
