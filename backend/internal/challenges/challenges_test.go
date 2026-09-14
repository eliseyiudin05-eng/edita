package challenges

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestNormalizeCreate(t *testing.T) {
	deadline := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	input, err := NormalizeCreate(CreateInput{
		Title: "  Ролик для запуска  ", Brief: "  Создайте динамичный вертикальный ролик.  ",
		PrizeCents: 25_000, PrizePoints: 500, EndsAt: &deadline,
		SourceAssets: []string{"  https://cdn.example.com/brief.mp4  "},
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Title != "Ролик для запуска" || input.Brief != "Создайте динамичный вертикальный ролик." || input.SourceAssets[0] != "https://cdn.example.com/brief.mp4" {
		t.Fatalf("unexpected normalized input: %+v", input)
	}

	longTitle := strings.Repeat("я", 121)
	boundedInput, err := NormalizeCreate(CreateInput{Title: longTitle, Brief: "Достаточно подробное описание", CustomPrize: "Публикация"})
	if err != nil || len([]rune(boundedInput.Title)) != 120 {
		t.Fatalf("title was not bounded: len=%d err=%v", len([]rune(boundedInput.Title)), err)
	}
}

func TestNormalizeCreateRejectsInvalidContract(t *testing.T) {
	past := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	tests := []CreateInput{
		{Title: "ab", Brief: "Достаточно подробное описание", PrizePoints: 100},
		{Title: "Конкурс", Brief: "коротко", PrizePoints: 100},
		{Title: "Конкурс", Brief: "Достаточно подробное описание"},
		{Title: "Конкурс", Brief: "Достаточно подробное описание", PrizePoints: 5001},
		{Title: "Конкурс", Brief: "Достаточно подробное описание", CustomPrize: "Приз", EndsAt: &past},
		{Title: "Конкурс", Brief: "Достаточно подробное описание", CustomPrize: "Приз", SourceAssets: []string{"http://example.com/file"}},
		{Title: "Конкурс", Brief: "Достаточно подробное описание", CustomPrize: "Приз", SourceAssets: []string{"https://user:pass@example.com/file"}},
	}
	for _, input := range tests {
		if _, err := NormalizeCreate(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("expected ErrInvalid for %+v, got %v", input, err)
		}
	}
}

func TestNormalizeSubmissionAndStatus(t *testing.T) {
	const challengeID = "123e4567-e89b-12d3-a456-426614174000"
	const objectID = "223e4567-e89b-12d3-a456-426614174000"
	input, err := NormalizeSubmit(SubmitInput{ChallengeID: strings.ToUpper(challengeID), ObjectID: " " + objectID + " "})
	if err != nil || input.ChallengeID != challengeID || input.ObjectID != objectID {
		t.Fatalf("input=%+v err=%v", input, err)
	}
	if _, err := NormalizeSubmit(SubmitInput{ChallengeID: "bad", ObjectID: objectID}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid submission error=%v", err)
	}

	id, status, err := NormalizeStatus(strings.ToUpper(objectID), " WINNER ")
	if err != nil || id != objectID || status != "winner" {
		t.Fatalf("id=%q status=%q err=%v", id, status, err)
	}
	if _, _, err := NormalizeStatus(objectID, "declined"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid status error=%v", err)
	}
}
