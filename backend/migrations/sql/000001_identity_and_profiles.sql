create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists app_private;
revoke all on schema app_private from public;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text,
  email_confirmed_at timestamptz,
  disabled_at timestamptz,
  user_metadata jsonb not null default '{}'::jsonb,
  app_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  constraint app_users_email_length check (char_length(email::text) between 3 and 320),
  constraint app_users_password_hash_length check (password_hash is null or char_length(password_hash) <= 255)
);

create table if not exists public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  identity_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  refresh_token_hash bytea not null unique,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint auth_sessions_expiry check (expires_at > created_at)
);

create table if not exists public.auth_email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  purpose text not null check (purpose in ('confirm_email','recover_password','change_email')),
  token_hash bytea not null unique,
  email citext not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references public.app_users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','business','creator','admin')),
  display_name text,
  username citext unique,
  level integer not null default 1 check (level >= 1),
  xp integer not null default 0 check (xp >= 0),
  ai_score integer check (ai_score between 0 and 100),
  skills text[] not null default '{}',
  earnings_cents bigint not null default 0 check (earnings_cents >= 0),
  onboarding jsonb not null default '{}'::jsonb,
  guardian_verified boolean not null default false,
  editor_verification_level text not null default 'unverified',
  referral_code citext unique,
  referral_points integer not null default 0 check (referral_points >= 0),
  plan text not null default 'free',
  plan_expires_at timestamptz,
  avatar_url text,
  school_name text,
  show_school_publicly boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 120),
  constraint profiles_username_length check (username is null or char_length(username::text) between 3 and 40),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 700),
  constraint profiles_school_name_length check (school_name is null or char_length(school_name) between 2 and 160)
);

create index if not exists auth_identities_user_idx on public.auth_identities(user_id);
create index if not exists auth_sessions_user_active_idx on public.auth_sessions(user_id, expires_at desc) where revoked_at is null;
create index if not exists auth_email_tokens_user_purpose_idx on public.auth_email_tokens(user_id, purpose, created_at desc) where consumed_at is null;
create index if not exists profiles_role_idx on public.profiles(role);

create or replace view public.public_profiles with (security_invoker=true) as
select id, display_name, username, level, xp, ai_score, skills, editor_verification_level,
       greatest(0, xp + coalesce(ai_score, 0) * 10 + referral_points) as rating_points,
       avatar_url, case when show_school_publicly then school_name else null end as school_name
from public.profiles;

revoke all on public.app_users, public.auth_identities, public.auth_sessions, public.auth_email_tokens from public;
