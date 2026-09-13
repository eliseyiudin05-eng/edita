package config

import (
	"errors"
	"log/slog"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address                string
	Environment            string
	LogLevel               slog.Level
	MaxBodyBytes           int64
	ReadHeaderTimeout      time.Duration
	ReadTimeout            time.Duration
	WriteTimeout           time.Duration
	IdleTimeout            time.Duration
	ShutdownTimeout        time.Duration
	DependencyTimeout      time.Duration
	DatabaseURL            string
	DatabaseMaxConns       int32
	SupabaseURL            string
	SupabasePublishableKey string
	JWTIssuer              string
	JWKSURL                string
	JWTAudience            string
	JWKSCacheTTL           time.Duration
	JWKSHTTPTimeout        time.Duration
	ProfileHTTPTimeout     time.Duration
	AcademyHTTPTimeout     time.Duration
	SocialHTTPTimeout      time.Duration
	BusinessHTTPTimeout    time.Duration
}

func Load() Config {
	supabaseURL := strings.TrimRight(envString("GO_BACKEND_SUPABASE_URL", ""), "/")
	issuer := ""
	jwksURL := ""
	if supabaseURL != "" {
		issuer = supabaseURL + "/auth/v1"
		jwksURL = issuer + "/.well-known/jwks.json"
	}

	return Config{
		Address:                envString("GO_BACKEND_ADDRESS", ":8080"),
		Environment:            envString("GO_BACKEND_ENV", "development"),
		LogLevel:               logLevel(envString("GO_BACKEND_LOG_LEVEL", "info")),
		MaxBodyBytes:           envInt64("GO_BACKEND_MAX_BODY_BYTES", 1<<20, 1024, 10<<20),
		ReadHeaderTimeout:      envDuration("GO_BACKEND_READ_HEADER_TIMEOUT", 5*time.Second),
		ReadTimeout:            envDuration("GO_BACKEND_READ_TIMEOUT", 15*time.Second),
		WriteTimeout:           envDuration("GO_BACKEND_WRITE_TIMEOUT", 30*time.Second),
		IdleTimeout:            envDuration("GO_BACKEND_IDLE_TIMEOUT", 60*time.Second),
		ShutdownTimeout:        envDuration("GO_BACKEND_SHUTDOWN_TIMEOUT", 10*time.Second),
		DependencyTimeout:      envDuration("GO_BACKEND_DEPENDENCY_TIMEOUT", 3*time.Second),
		DatabaseURL:            envString("GO_BACKEND_DATABASE_URL", ""),
		DatabaseMaxConns:       int32(envInt64("GO_BACKEND_DATABASE_MAX_CONNS", 4, 1, 20)),
		SupabaseURL:            supabaseURL,
		SupabasePublishableKey: envString("GO_BACKEND_SUPABASE_PUBLISHABLE_KEY", ""),
		JWTIssuer:              issuer,
		JWKSURL:                jwksURL,
		JWTAudience:            envString("GO_BACKEND_JWT_AUDIENCE", "authenticated"),
		JWKSCacheTTL:           envDurationBounded("GO_BACKEND_JWKS_CACHE_TTL", 5*time.Minute, time.Minute, 10*time.Minute),
		JWKSHTTPTimeout:        envDurationBounded("GO_BACKEND_JWKS_HTTP_TIMEOUT", 5*time.Second, time.Second, 15*time.Second),
		ProfileHTTPTimeout:     envDurationBounded("GO_BACKEND_PROFILE_HTTP_TIMEOUT", 3*time.Second, 500*time.Millisecond, 10*time.Second),
		AcademyHTTPTimeout:     envDurationBounded("GO_BACKEND_ACADEMY_HTTP_TIMEOUT", 3*time.Second, 500*time.Millisecond, 10*time.Second),
		SocialHTTPTimeout:      envDurationBounded("GO_BACKEND_SOCIAL_HTTP_TIMEOUT", 3*time.Second, 500*time.Millisecond, 10*time.Second),
		BusinessHTTPTimeout:    envDurationBounded("GO_BACKEND_BUSINESS_HTTP_TIMEOUT", 3*time.Second, 500*time.Millisecond, 10*time.Second),
	}
}

func (c Config) Validate() error {
	if c.DatabaseURL != "" {
		databaseURL, err := url.Parse(c.DatabaseURL)
		if err != nil || (databaseURL.Scheme != "postgres" && databaseURL.Scheme != "postgresql") || databaseURL.Host == "" {
			return errors.New("GO_BACKEND_DATABASE_URL must be a valid PostgreSQL URL")
		}
		if strings.EqualFold(c.Environment, "production") {
			sslMode := strings.ToLower(databaseURL.Query().Get("sslmode"))
			if sslMode == "disable" || sslMode == "allow" || sslMode == "prefer" {
				return errors.New("GO_BACKEND_DATABASE_URL must require TLS in production")
			}
		}
	}

	if c.SupabaseURL != "" {
		projectURL, err := url.Parse(c.SupabaseURL)
		if err != nil || projectURL.Scheme != "https" || projectURL.Host == "" || projectURL.User != nil || (projectURL.Path != "" && projectURL.Path != "/") || projectURL.RawQuery != "" || projectURL.Fragment != "" {
			return errors.New("GO_BACKEND_SUPABASE_URL must be an HTTPS project URL")
		}
	}
	if c.SupabasePublishableKey != "" && c.SupabaseURL == "" {
		return errors.New("GO_BACKEND_SUPABASE_PUBLISHABLE_KEY requires GO_BACKEND_SUPABASE_URL")
	}
	if len(c.SupabasePublishableKey) > 4096 || strings.ContainsAny(c.SupabasePublishableKey, "\r\n") {
		return errors.New("GO_BACKEND_SUPABASE_PUBLISHABLE_KEY is invalid")
	}

	return nil
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

func envDurationBounded(key string, fallback, minimum, maximum time.Duration) time.Duration {
	value := envDuration(key, fallback)
	if value < minimum || value > maximum {
		return fallback
	}
	return value
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
