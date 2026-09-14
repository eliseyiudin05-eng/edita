package auth

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestOpaqueTokenIsRandomAndStoredAsDigest(t *testing.T) {
	first, firstDigest, err := opaqueToken()
	if err != nil {
		t.Fatal(err)
	}
	second, secondDigest, err := opaqueToken()
	if err != nil {
		t.Fatal(err)
	}
	if first == second || bytes.Equal(firstDigest, secondDigest) || len(firstDigest) != 32 {
		t.Fatal("refresh tokens must be random and stored as SHA-256 digests")
	}
}

func TestHasMotivationUsesTrimmedUnicodeText(t *testing.T) {
	if !hasMotivation(json.RawMessage(`{"motivation":"  хочу учиться  "}`)) {
		t.Fatal("valid motivation was rejected")
	}
	for _, value := range []json.RawMessage{json.RawMessage(`{"motivation":"да"}`), json.RawMessage(`{"motivation":42}`), json.RawMessage(`{`)} {
		if hasMotivation(value) {
			t.Fatalf("invalid motivation was accepted: %s", value)
		}
	}
}

func TestEmailValidation(t *testing.T) {
	for _, value := range []string{"user@example.com", "name+tag@sub.example.org"} {
		if !validEmail(value) {
			t.Fatalf("expected valid email %q", value)
		}
	}
	for _, value := range []string{"", "broken", "a@b", "a b@example.com", "a@example.com\nBcc:x@y.test"} {
		if validEmail(value) {
			t.Fatalf("expected invalid email %q", value)
		}
	}
}
