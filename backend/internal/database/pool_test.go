package database

import (
	"net/url"
	"testing"
)

func TestNormalizedDatabaseURLEnforcesTLSWithoutLosingCredentials(t *testing.T) {
	raw := "postgresql://user:password@example.supabase.co:5432/postgres?connect_timeout=5"
	normalized, err := normalizedDatabaseURL(raw, true)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(normalized)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Query().Get("sslmode") != "require" || parsed.Query().Get("connect_timeout") != "5" {
		t.Fatalf("unexpected query: %q", parsed.RawQuery)
	}
	password, _ := parsed.User.Password()
	if password != "password" {
		t.Fatal("database credentials were changed")
	}
}

func TestNormalizedDatabaseURLLeavesDevelopmentURLUntouched(t *testing.T) {
	raw := "postgresql://localhost/postgres?sslmode=disable"
	normalized, err := normalizedDatabaseURL(raw, false)
	if err != nil || normalized != raw {
		t.Fatalf("normalized = %q, error = %v", normalized, err)
	}
}
