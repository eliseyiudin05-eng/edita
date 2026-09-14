package profile

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository stores profile state in the application PostgreSQL database.
// The authenticated subject is always part of the predicate, so callers cannot
// read or mutate another account by supplying an arbitrary identifier.
type PostgresRepository struct{ db *pgxpool.Pool }

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetLearningPreferences(ctx context.Context, _ string, subject string) (LearningPreferences, error) {
	if r == nil || r.db == nil || strings.TrimSpace(subject) == "" {
		return LearningPreferences{}, ErrUnavailable
	}
	var role string
	var onboarding []byte
	err := r.db.QueryRow(ctx, `select role, onboarding from public.profiles where id=$1`, subject).Scan(&role, &onboarding)
	if errors.Is(err, pgx.ErrNoRows) {
		return LearningPreferences{}, ErrNotFound
	}
	if err != nil || !validRole(role) {
		return LearningPreferences{}, ErrUnavailable
	}
	var preferences Preferences
	if err := json.Unmarshal(onboarding, &preferences); err != nil || validatePreferences(preferences) != nil {
		return LearningPreferences{}, ErrUnavailable
	}
	return LearningPreferences{Role: role, Preferences: preferences}, nil
}

func (r *PostgresRepository) GetPublicSettings(ctx context.Context, _ string, subject string) (PublicSettings, error) {
	if r == nil || r.db == nil || strings.TrimSpace(subject) == "" {
		return PublicSettings{}, ErrUnavailable
	}
	var result PublicSettings
	err := r.db.QueryRow(ctx, `
		select coalesce(display_name,''), coalesce(username::text,''), coalesce(school_name,''),
		       coalesce(avatar_url,''), show_school_publicly
		from public.profiles where id=$1`, subject).Scan(
		&result.DisplayName, &result.Username, &result.SchoolName, &result.AvatarURL, &result.ShowSchoolPublicly,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicSettings{}, ErrNotFound
	}
	if err != nil {
		return PublicSettings{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) UpdatePublicSettings(ctx context.Context, _ string, subject string, settings PublicSettings) (PublicSettings, error) {
	settings, err := NormalizePublicSettings(settings)
	if r == nil || r.db == nil || strings.TrimSpace(subject) == "" || err != nil {
		return PublicSettings{}, ErrUnavailable
	}
	var result PublicSettings
	err = r.db.QueryRow(ctx, `
		update public.profiles
		set display_name=$2, username=$3, school_name=nullif($4,''), avatar_url=nullif($5,''),
		    show_school_publicly=$6, updated_at=now()
		where id=$1
		returning coalesce(display_name,''), coalesce(username::text,''), coalesce(school_name,''),
		          coalesce(avatar_url,''), show_school_publicly`,
		subject, settings.DisplayName, settings.Username, settings.SchoolName, settings.AvatarURL, settings.ShowSchoolPublicly,
	).Scan(&result.DisplayName, &result.Username, &result.SchoolName, &result.AvatarURL, &result.ShowSchoolPublicly)
	if errors.Is(err, pgx.ErrNoRows) {
		return PublicSettings{}, ErrNotFound
	}
	var databaseError *pgconn.PgError
	if errors.As(err, &databaseError) && databaseError.Code == "23505" {
		return PublicSettings{}, ErrConflict
	}
	if err != nil || result != settings {
		return PublicSettings{}, ErrUnavailable
	}
	return result, nil
}

func (r *PostgresRepository) UpdateLearningPreferences(ctx context.Context, _ string, subject string, preferences Preferences) (UpdateLearningPreferencesResponse, error) {
	if r == nil || r.db == nil || strings.TrimSpace(subject) == "" || validatePreferences(preferences) != nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	var role string
	var onboarding []byte
	err := r.db.QueryRow(ctx, `
		update public.profiles
		set onboarding = onboarding || jsonb_build_object('level',$2::text,'software',$3::text,'goal',$4::text), updated_at=now()
		where id=$1 and role='editor'
		returning role, onboarding`, subject, preferences.Level, preferences.Software, preferences.Goal).Scan(&role, &onboarding)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists bool
		if lookupErr := r.db.QueryRow(ctx, `select exists(select 1 from public.profiles where id=$1)`, subject).Scan(&exists); lookupErr != nil {
			return UpdateLearningPreferencesResponse{}, ErrUnavailable
		}
		if !exists {
			return UpdateLearningPreferencesResponse{}, ErrNotFound
		}
		return UpdateLearningPreferencesResponse{}, ErrForbidden
	}
	if err != nil || role != "editor" {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	var result map[string]any
	if json.Unmarshal(onboarding, &result) != nil {
		return UpdateLearningPreferencesResponse{}, ErrUnavailable
	}
	return UpdateLearningPreferencesResponse{OK: true, Onboarding: result}, nil
}
