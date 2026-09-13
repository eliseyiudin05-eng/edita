create table if not exists public.discussion_members (
  topic_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (topic_key,user_id),
  constraint discussion_members_topic_key_check check (topic_key ~ '^[a-z0-9-]{3,80}$')
);

create table if not exists public.discussion_messages (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1400),
  status text not null default 'published' check (status in ('published','removed')),
  created_at timestamptz not null default now(),
  constraint discussion_messages_membership_fk
    foreign key (topic_key,author_id)
    references public.discussion_members(topic_key,user_id)
    on delete cascade
);

create index if not exists discussion_messages_topic_created_idx
  on public.discussion_messages(topic_key,created_at desc);
create index if not exists discussion_members_user_idx
  on public.discussion_members(user_id);
create index if not exists discussion_messages_author_idx
  on public.discussion_messages(author_id);
create index if not exists discussion_messages_membership_idx
  on public.discussion_messages(topic_key,author_id);

alter table public.discussion_members enable row level security;
alter table public.discussion_messages enable row level security;

revoke all on public.discussion_members from anon,authenticated;
revoke all on public.discussion_messages from anon,authenticated;
grant all on public.discussion_members to service_role;
grant all on public.discussion_messages to service_role;

drop policy if exists "discussion members deny direct access" on public.discussion_members;
create policy "discussion members deny direct access"
  on public.discussion_members
  for all
  to anon,authenticated
  using (false)
  with check (false);

drop policy if exists "discussion messages deny direct access" on public.discussion_messages;
create policy "discussion messages deny direct access"
  on public.discussion_messages
  for all
  to anon,authenticated
  using (false)
  with check (false);
