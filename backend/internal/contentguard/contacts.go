package contentguard

import (
	"regexp"
	"strings"
)

var (
	emailPattern   = regexp.MustCompile(`(?i)[\p{L}\p{N}._%+\-]+\s*(?:@|\(at\)|\[at\]|собака)\s*[\p{L}\p{N}.\-]+\s*(?:\.|точка)\s*[\p{L}]{2,}`)
	phonePattern   = regexp.MustCompile(`(?:\+?\d[\s().\-]*){10,15}`)
	linkPattern    = regexp.MustCompile(`(?i)(?:https?://|www\.|t\.me/|wa\.me/|vk\.com/|discord\.gg/)`)
	handlePattern  = regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])@[\p{L}\p{N}_.\-]{3,}`)
	domainPattern  = regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])[\p{L}\p{N}\-]{2,}\s*(?:\.|точка)\s*(?:ru|com|net|org|me|рф|io|co|app|gg|tv|ai)(?:$|[^\p{L}\p{N}_])`)
	spelledPattern = regexp.MustCompile(`(?i)(?:ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)(?:[\s,.;:\-]+(?:ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)){5,}`)
)

var contactWords = []string{
	"telegram", "телеграм", "whatsapp", "ватсап", "вацап", "viber", "вайбер",
	"discord", "дискорд", "instagram", "инстаграм", "вконтакте", "пиши в личку",
	"напиши в личку", "мой номер", "номер телефона", "моя почта", "мой email",
	"мои контакты", "для связи",
}

func ContainsContact(value string) bool {
	text := strings.ToLower(strings.Map(func(r rune) rune {
		switch r {
		case '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff':
			return -1
		default:
			return r
		}
	}, strings.TrimSpace(value)))
	if emailPattern.MatchString(text) || phonePattern.MatchString(text) || linkPattern.MatchString(text) || handlePattern.MatchString(text) || domainPattern.MatchString(text) || spelledPattern.MatchString(text) {
		return true
	}
	for _, word := range contactWords {
		if strings.Contains(text, word) {
			return true
		}
	}
	return false
}
