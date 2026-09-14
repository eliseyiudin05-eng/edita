create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null,
  xp_reward integer not null default 100 check (xp_reward >= 0), content jsonb not null default '{}'::jsonb,
  published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status text not null default 'started' check (status in ('started','completed')),
  score integer check (score between 0 and 100), submission_note text,
  completed_at timestamptz, updated_at timestamptz not null default now(), primary key(user_id,lesson_id),
  check (submission_note is null or char_length(submission_note) <= 1000)
);
create table if not exists public.practice_sessions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scenario text not null default '' check (char_length(scenario) <= 2000),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=50),
  result jsonb check (result is null or jsonb_typeof(result)='object'), updated_at timestamptz not null default now()
);
create table if not exists public.learning_competitions (
  id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null,
  description text not null default '', task text not null default '', audience text not null default 'all',
  points_reward integer not null default 0, status text not null default 'draft', starts_at timestamptz,
  ends_at timestamptz, competition_kind text not null default 'learning' check (competition_kind in ('learning','prize')),
  prize_pool_cents bigint not null default 0, prize_split_cents bigint[] not null default '{}',
  max_entries integer not null default 100 check (max_entries between 1 and 10000),
  selection_metric text not null default 'human_score' check (selection_metric in ('human_score','verified_views')),
  requires_public_post boolean not null default false, social_tag text, season_number integer,
  recurs_every_months integer, created_at timestamptz not null default now()
);
create table if not exists public.learning_competition_entries (
  id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.learning_competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, status text not null default 'submitted',
  work_url text, judge_score integer check (judge_score between 0 and 100), verified_views bigint not null default 0,
  views_checked_at timestamptz, place integer check (place between 1 and 3), prize_cents bigint not null default 0,
  created_at timestamptz not null default now(), unique(competition_id,user_id)
);
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(), responded_at timestamptz,
  check (requester_id <> addressee_id), unique(requester_id,addressee_id)
);
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, description text not null default '', level_min integer not null default 1,
  member_limit integer not null default 30 check (member_limit between 2 and 200),
  created_at timestamptz not null default now()
);
create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','moderator','member')),
  joined_at timestamptz not null default now(), primary key(group_id,user_id)
);
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.study_groups(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  sender_kind text not null default 'user' check (sender_kind in ('user','ai','moderator')),
  content text not null check (char_length(content) between 1 and 3000),
  status text not null default 'published' check (status in ('published','removed')),
  moderation_reason text, created_at timestamptz not null default now(),
  check ((sender_kind='user' and author_id is not null) or sender_kind<>'user')
);
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(), referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','qualified','cancelled')),
  created_at timestamptz not null default now(), qualified_at timestamptz
);
create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  points_spent integer not null check (points_spent > 0), reward text not null, created_at timestamptz not null default now()
);

create index if not exists lesson_progress_user_completed_idx on public.lesson_progress(user_id, completed_at desc);
create index if not exists learning_entries_competition_status_idx on public.learning_competition_entries(competition_id,status,created_at);
create index if not exists friendships_requester_created_idx on public.friendships(requester_id,created_at desc);
create index if not exists friendships_addressee_created_idx on public.friendships(addressee_id,created_at desc);
create index if not exists study_group_members_user_idx on public.study_group_members(user_id,joined_at desc);
create index if not exists group_messages_group_created_idx on public.group_messages(group_id,created_at desc,id);
create index if not exists referrals_referrer_created_idx on public.referrals(referrer_id,created_at desc);
