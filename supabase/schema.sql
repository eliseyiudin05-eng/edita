
alter table public.profiles add column if not exists onboarding jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists plan text not null default 'free';
alter table public.profiles add column if not exists plan_expires_at timestamptz;
create extension if not exists "pgcrypto";
do $$ begin create type public.user_role as enum ('editor','business','admin'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'editor',
  display_name text,
  username text unique,
  level int not null default 1,
  xp int not null default 0,
  ai_score int check(ai_score between 0 and 100),
  skills text[] not null default '{}',
  earnings_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.businesses(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  brand_context jsonb not null default '{}'::jsonb,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.lessons(
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  xp_reward int not null default 100,
  content jsonb not null default '{}'::jsonb,
  published boolean not null default false
);

create table if not exists public.lesson_progress(
  user_id uuid references public.profiles(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  status text not null default 'started',
  score int,
  completed_at timestamptz,
  primary key(user_id,lesson_id)
);

create table if not exists public.challenges(
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id),
  title text not null,
  brief text not null,
  status text not null default 'draft',
  prize_cents bigint not null default 0,
  ends_at timestamptz,
  source_assets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_submissions(
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  video_url text not null,
  ai_score int,
  ai_feedback jsonb not null default '{}'::jsonb,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  unique(challenge_id,editor_id)
);

create table if not exists public.portfolio_items(
  id uuid primary key default gen_random_uuid(),
  editor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  video_url text not null,
  tags text[] not null default '{}',
  ai_score int,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  description text not null,
  budget_min_cents bigint,
  budget_max_cents bigint,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.job_applications(
  job_id uuid references public.jobs(id) on delete cascade,
  editor_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'applied',
  created_at timestamptz not null default now(),
  primary key(job_id,editor_id)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,role,display_name,username,onboarding)
  values(
    new.id,
    case when new.raw_user_meta_data->>'role'='business' then 'business'::public.user_role else 'editor'::public.user_role end,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    case when new.raw_user_meta_data->>'role'='business' then 'business-'||left(new.id::text,8) else 'editor-'||left(new.id::text,8) end,
    coalesce(new.raw_user_meta_data->'onboarding','{}'::jsonb)
  )
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.challenge_submissions enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.job_applications enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using(true);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for update using(auth.uid()=id);
drop policy if exists "business owner manages business" on public.businesses;
create policy "business owner manages business" on public.businesses for all using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists "own progress" on public.lesson_progress;
create policy "own progress" on public.lesson_progress for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "own submissions" on public.challenge_submissions;
create policy "own submissions" on public.challenge_submissions for all using(auth.uid()=editor_id) with check(auth.uid()=editor_id);
drop policy if exists "portfolio readable" on public.portfolio_items;
create policy "portfolio readable" on public.portfolio_items for select using(true);
drop policy if exists "own portfolio" on public.portfolio_items;
create policy "own portfolio" on public.portfolio_items for all using(auth.uid()=editor_id) with check(auth.uid()=editor_id);
drop policy if exists "own applications" on public.job_applications;
create policy "own applications" on public.job_applications for all using(auth.uid()=editor_id) with check(auth.uid()=editor_id);


alter table public.challenges enable row level security;

drop policy if exists "open challenges readable" on public.challenges;
create policy "open challenges readable" on public.challenges
for select using(status='open' or exists(
  select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
));

drop policy if exists "business creates challenges" on public.challenges;
create policy "business creates challenges" on public.challenges
for insert with check(exists(
  select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
));

drop policy if exists "business updates challenges" on public.challenges;
create policy "business updates challenges" on public.challenges
for update using(exists(
  select 1 from public.businesses b where b.id=business_id and b.owner_id=auth.uid()
));

drop policy if exists "business reads challenge submissions" on public.challenge_submissions;
create policy "business reads challenge submissions" on public.challenge_submissions
for select using(exists(
  select 1
  from public.challenges c
  join public.businesses b on b.id=c.business_id
  where c.id=challenge_id and b.owner_id=auth.uid()
));

drop policy if exists "business updates challenge submissions" on public.challenge_submissions;
create policy "business updates challenge submissions" on public.challenge_submissions
for update using(exists(
  select 1
  from public.challenges c
  join public.businesses b on b.id=c.business_id
  where c.id=challenge_id and b.owner_id=auth.uid()
));

drop policy if exists "business adds winner portfolio" on public.portfolio_items;
create policy "business adds winner portfolio" on public.portfolio_items
for insert with check(exists(
  select 1
  from public.challenge_submissions s
  join public.challenges c on c.id=s.challenge_id
  join public.businesses b on b.id=c.business_id
  where s.editor_id=portfolio_items.editor_id
    and s.video_url=portfolio_items.video_url
    and s.status='winner'
    and b.owner_id=auth.uid()
));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'challenge-submissions',
  'challenge-submissions',
  false,
  524288000,
  array['video/mp4','video/quicktime','video/webm']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "editors upload challenge videos" on storage.objects;
create policy "editors upload challenge videos" on storage.objects
for insert to authenticated
with check(
  bucket_id='challenge-submissions'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "editors read own challenge videos" on storage.objects;
create policy "editors read own challenge videos" on storage.objects
for select to authenticated
using(
  bucket_id='challenge-submissions'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "business reads submitted challenge videos" on storage.objects;
create policy "business reads submitted challenge videos" on storage.objects
for select to authenticated
using(
  bucket_id='challenge-submissions'
  and exists(
    select 1
    from public.challenge_submissions s
    join public.challenges c on c.id=s.challenge_id
    join public.businesses b on b.id=c.business_id
    where s.video_url=storage.objects.name and b.owner_id=auth.uid()
  )
);


create table if not exists public.payments(
  id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  product text not null,
  amount_cents bigint not null default 0,
  currency text not null default 'RUB',
  status text not null,
  provider text not null default 'yookassa',
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entitlements(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product text not null,
  source_payment_id text unique not null references public.payments(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;
alter table public.entitlements enable row level security;

drop policy if exists "users read own payments" on public.payments;
create policy "users read own payments" on public.payments
for select using(auth.uid()=user_id);

drop policy if exists "users read own entitlements" on public.entitlements;
create policy "users read own entitlements" on public.entitlements
for select using(auth.uid()=user_id);
