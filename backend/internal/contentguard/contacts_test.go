package contentguard

import "testing"

func TestContainsContact(t *testing.T) {
	blocked := []string{
		"Напиши мне test@example.com",
		"Телефон +7 999 123-45-67",
		"Мой профиль https://example.com/me",
		"Пиши в Telegram",
		"Я там как @editor_pro",
		"Сайт example точка ru",
		"Номер девять девять девять один два три четыре пять шесть",
		"t.\u200bme/editor",
	}
	for _, value := range blocked {
		if !ContainsContact(value) {
			t.Fatalf("contact was not blocked: %q", value)
		}
	}
	allowed := []string{
		"Готов смонтировать ролик к пятнице.",
		"Нужен вертикальный ролик на 30 секунд.",
		"Оценка монтажа — 9 из 10.",
	}
	for _, value := range allowed {
		if ContainsContact(value) {
			t.Fatalf("safe message was blocked: %q", value)
		}
	}
}
