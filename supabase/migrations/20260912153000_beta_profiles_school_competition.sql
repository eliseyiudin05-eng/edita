create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists school_name text,
  add column if not exists show_school_publicly boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='profiles_avatar_url_length') then
    alter table public.profiles add constraint profiles_avatar_url_length
      check (avatar_url is null or char_length(avatar_url) <= 700);
  end if;
  if not exists (select 1 from pg_constraint where conname='profiles_school_name_length') then
    alter table public.profiles add constraint profiles_school_name_length
      check (school_name is null or char_length(school_name) between 2 and 160);
  end if;
end $$;

alter table public.public_profiles
  add column if not exists avatar_url text,
  add column if not exists school_name text;

create or replace function public.sync_public_profile()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='DELETE' then
    delete from public.public_profiles where id=old.id;
    return old;
  end if;

  insert into public.public_profiles(
    id,display_name,username,level,ai_score,skills,editor_verification_level,
    xp,rating_points,avatar_url,school_name
  )
  values(
    new.id,new.display_name,new.username,new.level,new.ai_score,new.skills,
    new.editor_verification_level,new.xp,
    greatest(0,new.xp + coalesce(new.ai_score,0)*10 + new.referral_points),
    new.avatar_url,case when new.show_school_publicly then new.school_name else null end
  )
  on conflict(id) do update set
    display_name=excluded.display_name,
    username=excluded.username,
    level=excluded.level,
    ai_score=excluded.ai_score,
    skills=excluded.skills,
    editor_verification_level=excluded.editor_verification_level,
    xp=excluded.xp,
    rating_points=excluded.rating_points,
    avatar_url=excluded.avatar_url,
    school_name=excluded.school_name;
  return new;
end;
$$;

insert into public.public_profiles(
  id,display_name,username,level,ai_score,skills,editor_verification_level,
  xp,rating_points,avatar_url,school_name
)
select
  id,display_name,username,level,ai_score,skills,editor_verification_level,
  xp,greatest(0,xp+coalesce(ai_score,0)*10+referral_points),avatar_url,
  case when show_school_publicly then school_name else null end
from public.profiles
on conflict(id) do update set
  display_name=excluded.display_name,
  username=excluded.username,
  level=excluded.level,
  ai_score=excluded.ai_score,
  skills=excluded.skills,
  editor_verification_level=excluded.editor_verification_level,
  xp=excluded.xp,
  rating_points=excluded.rating_points,
  avatar_url=excluded.avatar_url,
  school_name=excluded.school_name;

revoke update on public.profiles from authenticated;
grant update(display_name,username,avatar_url,school_name,show_school_publicly,onboarding) on public.profiles to authenticated;
revoke all on function public.sync_public_profile() from public, anon, authenticated;

alter table public.public_profiles enable row level security;
drop policy if exists "public profiles readable" on public.public_profiles;
drop policy if exists "safe public profiles readable" on public.public_profiles;
create policy "safe public profiles readable" on public.public_profiles
for select to anon, authenticated using(true);
grant select on public.public_profiles to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'avatars','avatars',true,5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict(id) do update set
  public=true,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "users insert own avatar" on storage.objects;
create policy "users insert own avatar" on storage.objects
for insert to authenticated
with check(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects
for update to authenticated
using(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar" on storage.objects
for delete to authenticated
using(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "users select own avatar metadata" on storage.objects;
create policy "users select own avatar metadata" on storage.objects
for select to authenticated
using(
  bucket_id='avatars'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create table if not exists public.beta_programs(
  id text primary key,
  title text not null,
  total_limit integer not null check(total_limit between 1 and 10000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_access_codes(
  id uuid primary key default gen_random_uuid(),
  program_id text not null references public.beta_programs(id) on delete cascade,
  code_hash text not null unique check(char_length(code_hash)=64),
  label text not null,
  max_uses integer not null default 1 check(max_uses between 1 and 1000),
  use_count integer not null default 0 check(use_count>=0),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.beta_members(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  program_id text not null references public.beta_programs(id) on delete cascade,
  access_code_id uuid not null references public.beta_access_codes(id) on delete restrict,
  joined_at timestamptz not null default now()
);

alter table public.beta_programs enable row level security;
alter table public.beta_access_codes enable row level security;
alter table public.beta_members enable row level security;

drop policy if exists "members read own beta membership" on public.beta_members;
create policy "members read own beta membership" on public.beta_members
for select to authenticated using((select auth.uid())=user_id);

grant select on public.beta_members to authenticated;
revoke all on public.beta_programs from anon, authenticated;
revoke all on public.beta_access_codes from anon, authenticated;
revoke insert,update,delete on public.beta_members from anon, authenticated;

create or replace function private.claim_beta_member()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  invitation public.beta_access_codes%rowtype;
  program public.beta_programs%rowtype;
  member_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('edita-beta-members'));

  select * into invitation
  from public.beta_access_codes
  where id=new.access_code_id
  for update;

  if invitation.id is null
     or not invitation.active
     or (invitation.expires_at is not null and invitation.expires_at<=now())
     or invitation.use_count>=invitation.max_uses then
    raise exception 'BETA_INVITE_UNAVAILABLE';
  end if;

  select * into program
  from public.beta_programs
  where id=invitation.program_id
  for update;

  if program.id is null
     or not program.active
     or program.starts_at>now()
     or (program.ends_at is not null and program.ends_at<=now()) then
    raise exception 'BETA_PROGRAM_CLOSED';
  end if;

  select count(*) into member_count
  from public.beta_members
  where program_id=program.id;

  if member_count>=program.total_limit then
    raise exception 'BETA_CAPACITY_REACHED';
  end if;

  new.program_id:=invitation.program_id;
  update public.beta_access_codes set use_count=use_count+1 where id=invitation.id;
  return new;
end;
$$;

create or replace function private.release_beta_member()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.beta_access_codes
  set use_count=greatest(0,use_count-1)
  where id=old.access_code_id;
  return old;
end;
$$;

drop trigger if exists claim_beta_member_before_insert on public.beta_members;
create trigger claim_beta_member_before_insert
before insert on public.beta_members
for each row execute function private.claim_beta_member();

drop trigger if exists release_beta_member_after_delete on public.beta_members;
create trigger release_beta_member_after_delete
after delete on public.beta_members
for each row execute function private.release_beta_member();

revoke all on function private.claim_beta_member() from public, anon, authenticated;
revoke all on function private.release_beta_member() from public, anon, authenticated;

insert into public.beta_programs(id,title,total_limit,starts_at,ends_at,active)
values('closed-beta-2026-01','Закрытая бета EDITA',50,'2026-09-12T00:00:00Z','2026-11-12T23:59:59Z',true)
on conflict(id) do update set
  title=excluded.title,total_limit=excluded.total_limit,starts_at=excluded.starts_at,
  ends_at=excluded.ends_at,active=excluded.active;

insert into public.beta_access_codes(program_id,code_hash,label,max_uses,expires_at)
values
  ('closed-beta-2026-01','0ce7be98b37f10e52dc958e62b6d8d1d52c1a0d8b3641210cf9d04d2c1995f6a','Тестировщик 1',1,'2026-11-12T23:59:59Z'),
  ('closed-beta-2026-01','17a1fffa904f2ef090f52f5dae511e47f0f85aa8e617ca4372ad5be279bdec87','Тестировщик 2',1,'2026-11-12T23:59:59Z'),
  ('closed-beta-2026-01','070b76dfdde03c178a13329c05a52de04be8fb5e6f73faddbea8fccce51dd8b9','Тестировщик 3',1,'2026-11-12T23:59:59Z'),
  ('closed-beta-2026-01','c8b5e0f521be19cc082ce85694456086e5280ef889f7be8925c32af8ff1acbee','Тестировщик 4',1,'2026-11-12T23:59:59Z'),
  ('closed-beta-2026-01','48f86e75a8bf88ec08cb41f6ef0509fec6aef23125cdd81115fc74cb22d81c58','Тестировщик 5',1,'2026-11-12T23:59:59Z')
on conflict(code_hash) do update set
  label=excluded.label,max_uses=excluded.max_uses,expires_at=excluded.expires_at,active=true;

alter table public.lesson_progress
  add column if not exists submission_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='lesson_progress_submission_note_length') then
    alter table public.lesson_progress add constraint lesson_progress_submission_note_length
      check(submission_note is null or char_length(submission_note)<=1000);
  end if;
end $$;

alter table public.learning_competitions
  add column if not exists competition_kind text not null default 'learning',
  add column if not exists prize_pool_cents bigint not null default 0,
  add column if not exists prize_split_cents bigint[] not null default '{}',
  add column if not exists max_entries integer not null default 100,
  add column if not exists selection_metric text not null default 'human_score',
  add column if not exists requires_public_post boolean not null default false,
  add column if not exists social_tag text,
  add column if not exists season_number integer,
  add column if not exists recurs_every_months integer;

alter table public.learning_competition_entries
  add column if not exists verified_views bigint not null default 0,
  add column if not exists views_checked_at timestamptz,
  add column if not exists place integer,
  add column if not exists prize_cents bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='learning_competitions_kind_check') then
    alter table public.learning_competitions add constraint learning_competitions_kind_check
      check(competition_kind in ('learning','prize'));
  end if;
  if not exists (select 1 from pg_constraint where conname='learning_competitions_metric_check') then
    alter table public.learning_competitions add constraint learning_competitions_metric_check
      check(selection_metric in ('human_score','verified_views'));
  end if;
  if not exists (select 1 from pg_constraint where conname='learning_competitions_capacity_check') then
    alter table public.learning_competitions add constraint learning_competitions_capacity_check
      check(max_entries between 1 and 10000);
  end if;
  if not exists (select 1 from pg_constraint where conname='learning_entries_place_check') then
    alter table public.learning_competition_entries add constraint learning_entries_place_check
      check(place is null or place between 1 and 3);
  end if;
end $$;

create or replace function private.enforce_competition_capacity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  allowed_entries integer;
  current_entries integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.competition_id::text));
  select max_entries into allowed_entries
  from public.learning_competitions
  where id=new.competition_id;
  select count(*) into current_entries
  from public.learning_competition_entries
  where competition_id=new.competition_id;
  if allowed_entries is null or current_entries>=allowed_entries then
    raise exception 'COMPETITION_CAPACITY_REACHED';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_competition_capacity_before_insert on public.learning_competition_entries;
create trigger enforce_competition_capacity_before_insert
before insert on public.learning_competition_entries
for each row execute function private.enforce_competition_capacity();
revoke all on function private.enforce_competition_capacity() from public, anon, authenticated;

insert into public.learning_competitions(
  slug,title,description,task,audience,points_reward,status,starts_at,ends_at,
  competition_kind,prize_pool_cents,prize_split_cents,max_entries,selection_metric,
  requires_public_post,social_tag,season_number,recurs_every_months
)
values(
  'edita-reels-season-1',
  'Сними Reel про EDITA · Сезон 1',
  'Сделай честный вертикальный ролик о том, как EDITA помогает разобраться в монтаже. Опубликуй его в открытой социальной сети и отметь EDITA. Три ролика с наибольшим подтверждённым количеством просмотров получат денежные призы.',
  'Вертикальный Reel 20–60 секунд. Покажи проблему новичка, один понятный момент внутри EDITA и свой честный вывод. Опубликуй ролик в открытом аккаунте, отметь EDITA и отправь прямую ссылку на публикацию. Накрутка, чужие ролики и удалённые публикации не учитываются.',
  'all',500,'open','2026-09-12T00:00:00Z','2026-11-12T20:59:59Z',
  'prize',1000000,array[500000,300000,200000]::bigint[],100,'verified_views',
  true,'@EDITA',1,2
)
on conflict(slug) do update set
  title=excluded.title,description=excluded.description,task=excluded.task,
  audience=excluded.audience,points_reward=excluded.points_reward,status=excluded.status,
  starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  competition_kind=excluded.competition_kind,prize_pool_cents=excluded.prize_pool_cents,
  prize_split_cents=excluded.prize_split_cents,max_entries=excluded.max_entries,
  selection_metric=excluded.selection_metric,requires_public_post=excluded.requires_public_post,
  social_tag=excluded.social_tag,season_number=excluded.season_number,
  recurs_every_months=excluded.recurs_every_months;

create index if not exists public_profiles_rating_points_idx
  on public.public_profiles(rating_points desc);
create index if not exists public_profiles_school_name_idx
  on public.public_profiles(school_name) where school_name is not null;
create index if not exists learning_entries_views_idx
  on public.learning_competition_entries(competition_id,verified_views desc);
create unique index if not exists learning_entries_unique_place_idx
  on public.learning_competition_entries(competition_id,place)
  where place is not null;
create index if not exists beta_access_codes_program_idx
  on public.beta_access_codes(program_id,active);
create index if not exists beta_members_program_id_idx
  on public.beta_members(program_id);
create index if not exists beta_members_access_code_id_idx
  on public.beta_members(access_code_id);
