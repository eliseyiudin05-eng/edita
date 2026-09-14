package jobs

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeCreateTrimsAndBoundsInput(t *testing.T) {
	input, err := NormalizeCreate(CreateInput{
		Title:         "  Монтаж ролика  ",
		Description:   "  Нужен динамичный вертикальный ролик.  ",
		PaymentPoints: 500,
	})
	if err != nil {
		t.Fatal(err)
	}
	if input.Title != "Монтаж ролика" || input.Description != "Нужен динамичный вертикальный ролик." || input.PaymentPoints != 500 {
		t.Fatalf("unexpected normalized input: %+v", input)
	}

	longTitle := strings.Repeat("я", 121)
	boundedInput, err := NormalizeCreate(CreateInput{Title: longTitle, Description: "Достаточно подробное описание", PaymentPoints: 100})
	if err != nil || len([]rune(boundedInput.Title)) != 120 {
		t.Fatalf("title was not bounded: len=%d err=%v", len([]rune(boundedInput.Title)), err)
	}
}

func TestNormalizeCreateRejectsInvalidContract(t *testing.T) {
	tests := []CreateInput{
		{Title: "ab", Description: "Достаточно подробное описание", PaymentPoints: 100},
		{Title: "Задача", Description: "коротко", PaymentPoints: 100},
		{Title: "Задача", Description: "Достаточно подробное описание", PaymentPoints: 99},
		{Title: "Задача", Description: "Достаточно подробное описание", PaymentPoints: 10_000_001},
	}
	for _, input := range tests {
		if _, err := NormalizeCreate(input); !errors.Is(err, ErrInvalid) {
			t.Fatalf("expected ErrInvalid for %+v, got %v", input, err)
		}
	}
}

func TestNormalizeUUID(t *testing.T) {
	const id = "123e4567-e89b-12d3-a456-426614174000"
	got, err := NormalizeUUID("  " + strings.ToUpper(id) + "  ")
	if err != nil || got != id {
		t.Fatalf("got=%q err=%v", got, err)
	}
	if _, err := NormalizeUUID("not-an-id"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid UUID error=%v", err)
	}
}
