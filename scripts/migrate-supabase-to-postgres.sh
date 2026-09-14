#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" != "--execute" ]]; then
  printf '%s\n' 'Dry-run guard: pass --execute after setting SOURCE_DATABASE_URL and TARGET_DATABASE_URL.'
  exit 0
fi

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"

for command_name in psql pg_dump pg_restore; do
  command -v "$command_name" >/dev/null || { printf 'Missing command: %s\n' "$command_name" >&2; exit 1; }
done

source_identity="$(psql -XAt "$SOURCE_DATABASE_URL" -c "select current_database()||'@'||coalesce(inet_server_addr()::text,'local')||':'||inet_server_port()")"
target_identity="$(psql -XAt "$TARGET_DATABASE_URL" -c "select current_database()||'@'||coalesce(inet_server_addr()::text,'local')||':'||inet_server_port()")"
if [[ -z "$source_identity" || -z "$target_identity" || "$source_identity" == "$target_identity" ]]; then
  printf '%s\n' 'Source and target databases must be distinct and reachable.' >&2
  exit 1
fi

migration_dir="$(mktemp -d)"
chmod 700 "$migration_dir"
trap 'rm -rf -- "$migration_dir"' EXIT

auth_csv="$migration_dir/auth_users.csv"
data_dump="$migration_dir/public-data.dump"

psql -X "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "\copy (
  select id,email,encrypted_password,email_confirmed_at,banned_until,
         coalesce(raw_user_meta_data,'{}'::jsonb),coalesce(raw_app_meta_data,'{}'::jsonb),
         created_at,updated_at,last_sign_in_at
  from auth.users
) to stdout with (format csv, header true)" >"$auth_csv"
chmod 600 "$auth_csv"

psql -X "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction <<SQL
create temporary table auth_users_import (
  id uuid,email citext,password_hash text,email_confirmed_at timestamptz,disabled_at timestamptz,
  user_metadata jsonb,app_metadata jsonb,created_at timestamptz,updated_at timestamptz,last_sign_in_at timestamptz
) on commit drop;
\copy auth_users_import from '$auth_csv' with (format csv, header true)
insert into public.app_users(
  id,email,password_hash,email_confirmed_at,disabled_at,user_metadata,app_metadata,created_at,updated_at,last_sign_in_at
)
select id,email,password_hash,email_confirmed_at,disabled_at,user_metadata,app_metadata,created_at,updated_at,last_sign_in_at
from auth_users_import
on conflict(id) do update set
  email=excluded.email,password_hash=excluded.password_hash,email_confirmed_at=excluded.email_confirmed_at,
  disabled_at=excluded.disabled_at,user_metadata=excluded.user_metadata,app_metadata=excluded.app_metadata,
  updated_at=excluded.updated_at,last_sign_in_at=excluded.last_sign_in_at;
SQL

allowlist=(
  profiles businesses lessons lesson_progress challenges challenge_submissions portfolio_items jobs job_applications
  payments entitlements ai_conversations ai_messages group_messages practice_sessions learning_competitions
  learning_competition_entries friendships study_groups study_group_members referrals referral_redemptions
  referral_reward_events signup_reward_events challenge_reward_events challenge_cash_reward_events
  learning_cash_reward_events beta_programs beta_access_codes beta_members
  future_plan_interest ai_feedback ai_knowledge_candidates ai_knowledge creator_briefs creator_program_applications
  creator_brief_interest business_campaigns business_campaign_applications business_reviews business_saved_editors
  private_conversations private_messages work_wallets work_orders work_order_deliverables point_topups work_point_events
  payout_requests editor_verification_requests guardian_verification_requests business_verification_requests
  discussion_members discussion_messages business_discussion_messages testimonials
)

table_args=()
for table_name in "${allowlist[@]}"; do
  if [[ "$(psql -XAt "$SOURCE_DATABASE_URL" -v name="$table_name" -c "select count(*) from information_schema.tables where table_schema='public' and table_name=:'name'")" == "1" ]]; then
    table_args+=("--table=public.$table_name")
  fi
done

pg_dump "$SOURCE_DATABASE_URL" --format=custom --data-only --no-owner --no-privileges "${table_args[@]}" --file="$data_dump"
pg_restore --dbname="$TARGET_DATABASE_URL" --data-only --no-owner --no-privileges --single-transaction --exit-on-error "$data_dump"

for table_name in "${allowlist[@]}"; do
  if [[ "$(psql -XAt "$SOURCE_DATABASE_URL" -v name="$table_name" -c "select count(*) from information_schema.tables where table_schema='public' and table_name=:'name'")" != "1" ]]; then
    continue
  fi
  source_count="$(psql -XAt "$SOURCE_DATABASE_URL" -c "select count(*) from public.\"$table_name\"")"
  target_count="$(psql -XAt "$TARGET_DATABASE_URL" -c "select count(*) from public.\"$table_name\"")"
  if [[ "$source_count" != "$target_count" ]]; then
    printf 'Row count mismatch for %s: source=%s target=%s\n' "$table_name" "$source_count" "$target_count" >&2
    exit 1
  fi
done

financial_totals=(
  'profiles:referral_points' 'profiles:earnings_cents'
  'work_wallets:available_points' 'work_wallets:reserved_points'
  'point_topups:points' 'point_topups:amount_cents' 'work_point_events:points'
  'payout_requests:amount_cents' 'referral_reward_events:points' 'signup_reward_events:points'
  'challenge_reward_events:points' 'challenge_cash_reward_events:amount_cents'
  'learning_cash_reward_events:amount_cents'
)
for total_spec in "${financial_totals[@]}"; do
  table_name="${total_spec%%:*}"
  column_name="${total_spec##*:}"
  if [[ "$(psql -XAt "$SOURCE_DATABASE_URL" -v name="$table_name" -c "select count(*) from information_schema.tables where table_schema='public' and table_name=:'name'")" != "1" ]]; then
    continue
  fi
  source_total="$(psql -XAt "$SOURCE_DATABASE_URL" -c "select coalesce(sum(\"$column_name\"),0) from public.\"$table_name\"")"
  target_total="$(psql -XAt "$TARGET_DATABASE_URL" -c "select coalesce(sum(\"$column_name\"),0) from public.\"$table_name\"")"
  if [[ "$source_total" != "$target_total" ]]; then
    printf 'Financial total mismatch for %s.%s: source=%s target=%s\n' "$table_name" "$column_name" "$source_total" "$target_total" >&2
    exit 1
  fi
done

psql -X "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/verify-postgres-migration.sql"
printf 'Migration completed: %s -> %s\n' "$source_identity" "$target_identity"
