package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address           string
	Environment       string
	LogLevel          slog.Level
	MaxBodyBytes      int64
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownTimeout   time.Duration
}

func Load() Config {
	return Config{
		Address:           envString("GO_BACKEND_ADDRESS", ":8080"),
		Environment:       envString("GO_BACKEND_ENV", "development"),
		LogLevel:          logLevel(envString("GO_BACKEND_LOG_LEVEL", "info")),
		MaxBodyBytes:      envInt64("GO_BACKEND_MAX_BODY_BYTES", 1<<20, 1024, 10<<20),
		ReadHeaderTimeout: envDuration("GO_BACKEND_READ_HEADER_TIMEOUT", 5*time.Second),
		ReadTimeout:       envDuration("GO_BACKEND_READ_TIMEOUT", 15*time.Second),
		WriteTimeout:      envDuration("GO_BACKEND_WRITE_TIMEOUT", 30*time.Second),
		IdleTimeout:       envDuration("GO_BACKEND_IDLE_TIMEOUT", 60*time.Second),
		ShutdownTimeout:   envDuration("GO_BACKEND_SHUTDOWN_TIMEOUT", 10*time.Second),
	}
}

func envString(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envInt64(key string, fallback, minimum, maximum int64) int64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || parsed < minimum || parsed > maximum {
		return fallback
	}
	return parsed
}

func logLevel(value string) slog.Level {
	switch strings.ToLower(value) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
