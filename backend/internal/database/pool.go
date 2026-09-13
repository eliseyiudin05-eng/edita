package database

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Pool struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string, maxConnections int32, enforceTLS bool) (*Pool, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, errors.New("database URL is empty")
	}

	databaseURL, err := normalizedDatabaseURL(databaseURL, enforceTLS)
	if err != nil {
		return nil, err
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("parse database configuration")
	}
	if maxConnections < 1 {
		maxConnections = 4
	}
	config.MaxConns = maxConnections
	config.MinConns = 0
	config.MaxConnIdleTime = 5 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute
	config.HealthCheckPeriod = 30 * time.Second

	// Supabase transaction pooler (port 6543) does not support prepared
	// statements. Simple protocol is compatible with direct, session and
	// transaction connections and is safe for this diagnostic migration stage.
	parsedURL, err := url.Parse(databaseURL)
	if err == nil && parsedURL.Port() == "6543" {
		config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, errors.New("create database pool")
	}
	return &Pool{pool: pool}, nil
}

func normalizedDatabaseURL(databaseURL string, enforceTLS bool) (string, error) {
	parsedURL, err := url.Parse(databaseURL)
	if err != nil {
		return "", errors.New("parse database URL")
	}
	if !enforceTLS {
		return databaseURL, nil
	}
	query := parsedURL.Query()
	if query.Get("sslmode") == "" {
		query.Set("sslmode", "require")
		parsedURL.RawQuery = query.Encode()
	}
	return parsedURL.String(), nil
}

func (p *Pool) Ping(ctx context.Context) error {
	if p == nil || p.pool == nil {
		return errors.New("database pool is not configured")
	}
	return p.pool.Ping(ctx)
}

func (p *Pool) Close() {
	if p != nil && p.pool != nil {
		p.pool.Close()
	}
}
