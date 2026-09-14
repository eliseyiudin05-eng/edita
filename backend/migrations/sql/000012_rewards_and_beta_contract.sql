alter table public.referrals
  add column if not exists referral_code citext;

update public.referrals r
set referral_code=p.referral_code
from public.profiles p
where p.id=r.referrer_id and r.referral_code is null;

alter table public.referrals
  drop constraint if exists referrals_referral_code_length;
alter table public.referrals
  add constraint referrals_referral_code_length
  check (referral_code is null or char_length(referral_code::text) between 1 and 16);

create table if not exists public.referral_reward_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check(points>0),
  created_at timestamptz not null default now(),
  unique(referral_id,user_id)
);

create table if not exists public.signup_reward_events (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check(reason in ('editor_motivation')),
  points integer not null check(points between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_reward_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.challenge_submissions(id) on delete cascade,
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check(points>0),
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_cash_reward_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.challenge_submissions(id) on delete cascade,
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>0),
  created_at timestamptz not null default now()
);

create table if not exists public.learning_cash_reward_events (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.learning_competition_entries(id) on delete cascade,
  competition_id uuid not null references public.learning_competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>0),
  created_at timestamptz not null default now()
);

create table if not exists public.beta_programs (
  id text primary key,
  title text not null,
  total_limit integer not null check(total_limit between 1 and 10000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at>starts_at)
);

create table if not exists public.beta_access_codes (
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.beta_programs(id) on delete cascade,
  code_hash text not null unique check(char_length(code_hash)=64),
  label text not null,
  max_uses integer not null default 1 check(max_uses between 1 and 1000),
  use_count integer not null default 0 check(use_count between 0 and max_uses),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  program_id text not null references public.beta_programs(id) on delete cascade,
  access_code_id uuid not null references public.beta_access_codes(id) on delete restrict,
  joined_at timestamptz not null default now()
);

create index if not exists referrals_code_idx on public.referrals(referral_code);
create index if not exists referral_reward_events_user_created_idx on public.referral_reward_events(user_id,created_at desc);
create index if not exists challenge_reward_events_user_created_idx on public.challenge_reward_events(user_id,created_at desc);
create index if not exists challenge_cash_rewards_user_created_idx on public.challenge_cash_reward_events(user_id,created_at desc);
create index if not exists learning_cash_rewards_user_created_idx on public.learning_cash_reward_events(user_id,created_at desc);
create index if not exists beta_access_codes_program_active_idx on public.beta_access_codes(program_id,active);
create index if not exists beta_members_program_idx on public.beta_members(program_id);
create index if not exists beta_members_access_code_idx on public.beta_members(access_code_id);

revoke all on public.referral_reward_events,public.signup_reward_events,public.challenge_reward_events,
  public.challenge_cash_reward_events,public.learning_cash_reward_events,public.beta_programs,
  public.beta_access_codes,public.beta_members from public;
