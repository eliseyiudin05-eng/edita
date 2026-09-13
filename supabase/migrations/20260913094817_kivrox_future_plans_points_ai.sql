-- Future paid plans, KIVROX Points, challenge rewards and reviewed AI learning.
alter table public.challenges add column if not exists prize_points integer not null default 0;
alter table public.challenges add column if not exists custom_prize text;
alter table public.challenges drop constraint if exists challenges_prize_points_check;
alter table public.challenges add constraint challenges_prize_points_check check(prize_points between 0 and 100000000);
alter table public.challenges drop constraint if exists challenges_custom_prize_check;
alter table public.challenges add constraint challenges_custom_prize_check check(custom_prize is null or char_length(custom_prize)<=500);

create table if not exists public.future_plan_interest(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  audience text not null check(audience in ('editor','business')),
  wanted_plan text not null check(wanted_plan in ('creator_plus','studio_plus')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_reward_events(
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check(points>0),
  created_at timestamptz not null default now(),
  unique(referral_id,user_id)
);

create table if not exists public.referral_redemptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  points_spent integer not null check(points_spent>0),
  reward text not null check(char_length(reward) between 2 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.ai_messages(id) on delete cascade,
  helpful boolean not null,
  comment text check(comment is null or char_length(comment)<=1000),
  created_at timestamptz not null default now(),
  unique(user_id,message_id)
);

create table if not exists public.ai_knowledge_candidates(
  id uuid primary key default gen_random_uuid(),
  source_feedback_id uuid unique references public.ai_feedback(id) on delete set null,
  topic text not null check(char_length(topic) between 2 and 120),
  content text not null check(char_length(content) between 20 and 12000),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_knowledge(
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid unique references public.ai_knowledge_candidates(id) on delete set null,
  topic text not null check(char_length(topic) between 2 and 120),
  content text not null check(char_length(content) between 20 and 12000),
  version integer not null default 1 check(version>0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referral_redemptions_user_created_idx on public.referral_redemptions(user_id,created_at desc);
create index if not exists ai_feedback_user_created_idx on public.ai_feedback(user_id,created_at desc);
create index if not exists ai_knowledge_candidates_status_created_idx on public.ai_knowledge_candidates(status,created_at desc);
create index if not exists ai_knowledge_published_updated_idx on public.ai_knowledge(published,updated_at desc);

alter table public.future_plan_interest enable row level security;
alter table public.referral_reward_events enable row level security;
alter table public.referral_redemptions enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_knowledge_candidates enable row level security;
alter table public.ai_knowledge enable row level security;

create policy "own future plan interest readable" on public.future_plan_interest for select to authenticated using((select auth.uid())=user_id);
create policy "own future plan interest insertable" on public.future_plan_interest for insert to authenticated with check((select auth.uid())=user_id);
create policy "own future plan interest updateable" on public.future_plan_interest for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "own ai feedback readable" on public.ai_feedback for select to authenticated using((select auth.uid())=user_id);
create policy "own ai feedback insertable" on public.ai_feedback for insert to authenticated with check((select auth.uid())=user_id);
create policy "own ai feedback updateable" on public.ai_feedback for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "referral rewards are server only" on public.referral_reward_events for all to anon,authenticated using(false) with check(false);
create policy "referral redemptions are server only" on public.referral_redemptions for all to anon,authenticated using(false) with check(false);
create policy "ai candidates are server only" on public.ai_knowledge_candidates for all to anon,authenticated using(false) with check(false);
create policy "ai knowledge is server only" on public.ai_knowledge for all to anon,authenticated using(false) with check(false);

revoke all on public.referral_reward_events,public.referral_redemptions,public.ai_knowledge_candidates,public.ai_knowledge from anon,authenticated;
grant select,insert,update on public.future_plan_interest to authenticated;
grant select,insert,update on public.ai_feedback to authenticated;
grant all on public.future_plan_interest,public.referral_reward_events,public.referral_redemptions,public.ai_feedback,public.ai_knowledge_candidates,public.ai_knowledge to service_role;
