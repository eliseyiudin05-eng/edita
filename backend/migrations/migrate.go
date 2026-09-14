package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed sql/*.sql
var migrationFiles embed.FS

const migrationLockID int64 = 479_186_410_021

type migration struct {
	version  string
	name     string
	sql      string
	checksum string
}

// Apply upgrades a PostgreSQL database to the schema embedded in this binary.
// Every migration is checksum protected and committed in its own transaction.
func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	if pool == nil {
		return errors.New("database pool is required")
	}

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "select pg_advisory_lock($1)", migrationLockID); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	defer func() { _, _ = conn.Exec(context.WithoutCancel(ctx), "select pg_advisory_unlock($1)", migrationLockID) }()

	if _, err := conn.Exec(ctx, `
		create table if not exists public.schema_migrations (
			version text primary key,
			name text not null,
			checksum text not null,
			applied_at timestamptz not null default now()
		)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	items, err := load()
	if err != nil {
		return err
	}
	for _, item := range items {
		if err := applyOne(ctx, conn.Conn(), item); err != nil {
			return err
		}
	}
	return nil
}

func applyOne(ctx context.Context, conn *pgx.Conn, item migration) error {
	var checksum string
	err := conn.QueryRow(ctx, "select checksum from public.schema_migrations where version=$1", item.version).Scan(&checksum)
	switch {
	case err == nil && checksum == item.checksum:
		return nil
	case err == nil:
		return fmt.Errorf("migration %s checksum changed after application", item.version)
	case !errors.Is(err, pgx.ErrNoRows):
		return fmt.Errorf("read migration %s: %w", item.version, err)
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", item.version, err)
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	if _, err := tx.Exec(ctx, item.sql); err != nil {
		return fmt.Errorf("execute migration %s (%s): %w", item.version, item.name, err)
	}
	if _, err := tx.Exec(ctx,
		"insert into public.schema_migrations(version,name,checksum) values($1,$2,$3)",
		item.version, item.name, item.checksum,
	); err != nil {
		return fmt.Errorf("record migration %s: %w", item.version, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration %s: %w", item.version, err)
	}
	return nil
}

func load() ([]migration, error) {
	entries, err := fs.ReadDir(migrationFiles, "sql")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	items := make([]migration, 0, len(entries))
	seen := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		version, name, ok := strings.Cut(strings.TrimSuffix(entry.Name(), ".sql"), "_")
		if !ok || version == "" || name == "" {
			return nil, fmt.Errorf("invalid migration filename %q", entry.Name())
		}
		if _, duplicate := seen[version]; duplicate {
			return nil, fmt.Errorf("duplicate migration version %q", version)
		}
		seen[version] = struct{}{}
		body, err := migrationFiles.ReadFile("sql/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		digest := sha256.Sum256(body)
		items = append(items, migration{version: version, name: name, sql: string(body), checksum: hex.EncodeToString(digest[:])})
	}
	return items, nil
}
