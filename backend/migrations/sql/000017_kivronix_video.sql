-- v2.0.0-alpha.17: KIVRONIX Video, creator competitions and confidential video contacts.

create table if not exists public.portfolio_video_likes (
  video_id uuid not null references public.portfolio_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(video_id,user_id)
);

create table if not exists public.portfolio_video_comments (
  id uuid primary key,
  video_id uuid not null references public.portfolio_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  status text not null default 'visible' check (status in ('visible','hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id),
  check (follower_id<>following_id)
);

create table if not exists public.portfolio_video_share_events (
  id uuid primary key,
  video_id uuid not null references public.portfolio_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.video_contact_requests (
  id uuid primary key,
  video_id uuid not null references public.portfolio_items(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  conversation_id uuid unique references public.private_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(video_id,requester_id),
  check (requester_id<>editor_id)
);

create table if not exists public.creator_competitions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  brief text not null check (char_length(btrim(brief)) between 10 and 3000),
  prize_text text not null check (char_length(btrim(prize_text)) between 2 and 300),
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.creator_competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.creator_competitions(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_item_id uuid not null references public.portfolio_items(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted','winner')),
  created_at timestamptz not null default now(),
  unique(competition_id,participant_id)
);

alter table public.private_conversations
  drop constraint if exists private_conversations_source_kind_check;
alter table public.private_conversations
  add constraint private_conversations_source_kind_check
  check (source_kind in ('campaign','challenge','job','kivronix_contest','edita_contest','video')) not valid;

create index if not exists portfolio_video_comments_recent_idx on public.portfolio_video_comments(video_id,created_at desc,id) where status='visible';
create index if not exists portfolio_video_likes_count_idx on public.portfolio_video_likes(video_id);
create index if not exists portfolio_video_shares_count_idx on public.portfolio_video_share_events(video_id);
create index if not exists profile_follows_following_idx on public.profile_follows(following_id,created_at desc);
create index if not exists creator_competitions_open_idx on public.creator_competitions(ends_at,created_at desc) where status='open';
create index if not exists creator_competition_entries_competition_idx on public.creator_competition_entries(competition_id,created_at desc);

revoke all on public.portfolio_video_likes,public.portfolio_video_comments,public.profile_follows,
  public.portfolio_video_share_events,public.video_contact_requests,public.creator_competitions,
  public.creator_competition_entries from public;
