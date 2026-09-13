package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadUsesSafeDefaults(t *testing.T) {
	t.Setenv("GO_BACKEND_ADDRESS", "")
	t.Setenv("GO_BACKEND_MAX_BODY_BYTES", "not-a-number")
	t.Setenv("GO_BACKEND_READ_TIMEOUT", "-5s")

	cfg := Load()
	if cfg.Address != ":8080" {
		t.Fatalf("Address = %q, want :8080", cfg.Address)
	}
	if cfg.MaxBodyBytes != 1<<20 {
		t.Fatalf("MaxBodyBytes = %d, want %d", cfg.MaxBodyBytes, 1<<20)
	}
	if cfg.ReadTimeout != 15*time.Second {
		t.Fatalf("ReadTimeout = %s, want 15s", cfg.ReadTimeout)
	}
}

func TestLoadBuildsSupabaseJWTConfiguration(t *testing.T) {
	t.Setenv("GO_BACKEND_SUPABASE_URL", "https://example.supabase.co/")
	t.Setenv("GO_BACKEND_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
	t.Setenv("GO_BACKEND_JWKS_CACHE_TTL", "30m")

	cfg := Load()
	if cfg.JWTIssuer != "https://example.supabase.co/auth/v1" {
		t.Fatalf("JWTIssuer = %q", cfg.JWTIssuer)
	}
	if cfg.JWKSURL != "https://example.supabase.co/auth/v1/.well-known/jwks.json" {
		t.Fatalf("JWKSURL = %q", cfg.JWKSURL)
	}
	if cfg.SupabasePublishableKey != "sb_publishable_test" {
		t.Fatalf("SupabasePublishableKey = %q", cfg.SupabasePublishableKey)
	}
	if cfg.JWKSCacheTTL != 5*time.Minute {
		t.Fatalf("JWKSCacheTTL = %s, want safe fallback", cfg.JWKSCacheTTL)
	}
}

func TestPublishableKeyRequiresSupabaseURL(t *testing.T) {
	cfg := Config{SupabasePublishableKey: "sb_publishable_test"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted a publishable key without a project URL")
	}
}

func TestValidateRejectsUnsafeProductionDatabaseURL(t *testing.T) {
	cfg := Load()
	cfg.Environment = "production"
	cfg.DatabaseURL = "postgresql://user:password@example.com/postgres?sslmode=disable"

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "require TLS") {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestValidateRejectsNonHTTPSSupabaseURL(t *testing.T) {
	cfg := Load()
	cfg.SupabaseURL = "http://example.supabase.co"

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() unexpectedly accepted an insecure Supabase URL")
	}
}

func TestValidateRejectsSupabaseURLWithPath(t *testing.T) {
	cfg := Load()
	cfg.SupabaseURL = "https://example.supabase.co/auth/v1"

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate() unexpectedly accepted a Supabase URL with a path")
	}
}

func TestLoadAcceptsBoundedOverrides(t *testing.T) {
	t.Setenv("GO_BACKEND_ADDRESS", "127.0.0.1:9090")
	t.Setenv("GO_BACKEND_MAX_BODY_BYTES", "2048")
	t.Setenv("GO_BACKEND_SHUTDOWN_TIMEOUT", "3s")

	cfg := Load()
	if cfg.Address != "127.0.0.1:9090" || cfg.MaxBodyBytes != 2048 || cfg.ShutdownTimeout != 3*time.Second {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}
