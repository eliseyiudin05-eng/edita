package config

import (
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

func TestLoadAcceptsBoundedOverrides(t *testing.T) {
	t.Setenv("GO_BACKEND_ADDRESS", "127.0.0.1:9090")
	t.Setenv("GO_BACKEND_MAX_BODY_BYTES", "2048")
	t.Setenv("GO_BACKEND_SHUTDOWN_TIMEOUT", "3s")

	cfg := Load()
	if cfg.Address != "127.0.0.1:9090" || cfg.MaxBodyBytes != 2048 || cfg.ShutdownTimeout != 3*time.Second {
		t.Fatalf("unexpected config: %+v", cfg)
	}
}
