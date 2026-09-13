create table if not exists public.business_discussion_messages(
  id uuid primary key default gen_random_uuid(),
  topic_key text not null check(topic_key ~ '^[a-z0-9-]{3,80}$'),
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check(char_length(content) between 1 and 1400),
  status text not null default 'published' check(status in ('published','removed')),
  created_at timestamptz not null default now()
);
create index if not exists business_discussion_topic_created_idx on public.business_discussion_messages(topic_key,created_at desc);
create index if not exists business_discussion_author_idx on public.business_discussion_messages(author_id);
alter table public.business_discussion_messages enable row level security;
revoke all on public.business_discussion_messages from anon,authenticated;
grant all on public.business_discussion_messages to service_role;
drop policy if exists "business discussion deny direct access" on public.business_discussion_messages;
create policy "business discussion deny direct access" on public.business_discussion_messages for all to anon,authenticated using(false) with check(false);
