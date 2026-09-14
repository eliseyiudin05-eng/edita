create table if not exists public.object_buckets (
  id text primary key, public_read boolean not null default false,
  file_size_limit bigint not null check(file_size_limit > 0), allowed_mime_types text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text not null references public.object_buckets(id) on delete cascade,
  object_key text not null, owner_id uuid references public.profiles(id) on delete set null,
  size_bytes bigint not null check(size_bytes >= 0), content_type text not null,
  etag text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(bucket_id,object_key),
  check(char_length(object_key) between 1 and 1024)
);
create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(), topic text not null, aggregate_id text,
  payload jsonb not null, created_at timestamptz not null default now(),
  available_at timestamptz not null default now(), claimed_at timestamptz,
  delivered_at timestamptz, attempts integer not null default 0, last_error text
);
insert into public.object_buckets(id,public_read,file_size_limit,allowed_mime_types) values
  ('avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
  ('challenge-submissions',false,524288000,array['video/mp4','video/quicktime','video/webm']),
  ('business-verification',false,20971520,array['application/pdf','image/jpeg','image/png']),
  ('work-files',false,104857600,array['video/mp4','video/quicktime','video/webm','application/zip','image/jpeg','image/png'])
on conflict(id) do update set public_read=excluded.public_read,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create index if not exists objects_owner_created_idx on public.objects(owner_id,created_at desc);
create index if not exists outbox_pending_idx on public.outbox_events(available_at,id) where delivered_at is null;

revoke create on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;

alter table public.profiles enable row level security;
alter table public.auth_sessions enable row level security;

create policy profiles_current_user on public.profiles
  using (id = nullif(current_setting('app.user_id',true),'')::uuid)
  with check (id = nullif(current_setting('app.user_id',true),'')::uuid);
create policy sessions_current_user on public.auth_sessions
  using (user_id = nullif(current_setting('app.user_id',true),'')::uuid)
  with check (user_id = nullif(current_setting('app.user_id',true),'')::uuid);

create or replace function app_private.notify_outbox() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_notify('kivronix_outbox',new.id::text);
  return new;
end $$;
create trigger outbox_notify_after_insert after insert on public.outbox_events
for each row execute function app_private.notify_outbox();

revoke all on function app_private.notify_outbox() from public;
