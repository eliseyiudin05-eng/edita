create table if not exists public.ai_conversations(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_key text not null check(char_length(scope_key) between 1 and 100),
  title text not null default 'AI Помощник' check(char_length(title) between 1 and 120),
  lesson_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,scope_key)
);

create table if not exists public.ai_messages(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(content) between 1 and 12000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.group_messages(
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  sender_kind text not null default 'user' check(sender_kind in ('user','ai','moderator')),
  content text not null check(char_length(content) between 1 and 3000),
  status text not null default 'published' check(status in ('published','removed')),
  moderation_reason text,
  created_at timestamptz not null default now(),
  check((sender_kind='user' and author_id is not null) or sender_kind<>'user')
);

create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id,created_at);
create index if not exists group_messages_group_created_idx on public.group_messages(group_id,created_at desc);
create index if not exists group_messages_author_created_idx on public.group_messages(author_id,created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.group_messages enable row level security;

drop policy if exists "users read own ai conversations" on public.ai_conversations;
create policy "users read own ai conversations" on public.ai_conversations for select using(auth.uid()=user_id);
drop policy if exists "users create own ai conversations" on public.ai_conversations;
create policy "users create own ai conversations" on public.ai_conversations for insert with check(auth.uid()=user_id);
drop policy if exists "users update own ai conversations" on public.ai_conversations;
create policy "users update own ai conversations" on public.ai_conversations for update using(auth.uid()=user_id) with check(auth.uid()=user_id);
drop policy if exists "users delete own ai conversations" on public.ai_conversations;
create policy "users delete own ai conversations" on public.ai_conversations for delete using(auth.uid()=user_id);

drop policy if exists "users read own ai messages" on public.ai_messages;
create policy "users read own ai messages" on public.ai_messages for select using(
  auth.uid()=user_id and exists(
    select 1 from public.ai_conversations conversation
    where conversation.id=conversation_id and conversation.user_id=auth.uid()
  )
);
drop policy if exists "users create own ai messages" on public.ai_messages;
create policy "users create own ai messages" on public.ai_messages for insert with check(
  auth.uid()=user_id and exists(
    select 1 from public.ai_conversations conversation
    where conversation.id=conversation_id and conversation.user_id=auth.uid()
  )
);
drop policy if exists "users delete own ai messages" on public.ai_messages;
create policy "users delete own ai messages" on public.ai_messages for delete using(
  auth.uid()=user_id and exists(
    select 1 from public.ai_conversations conversation
    where conversation.id=conversation_id and conversation.user_id=auth.uid()
  )
);

drop policy if exists "group members read messages" on public.group_messages;
create policy "group members read messages" on public.group_messages for select using(
  exists(
    select 1 from public.study_group_members membership
    where membership.group_id=group_messages.group_id and membership.user_id=auth.uid()
  )
);
drop policy if exists "group members create messages" on public.group_messages;
create policy "group members create messages" on public.group_messages for insert with check(
  sender_kind='user' and author_id=auth.uid() and exists(
    select 1 from public.study_group_members membership
    where membership.group_id=group_messages.group_id and membership.user_id=auth.uid()
  )
);

grant select,insert,update,delete on public.ai_conversations to authenticated;
grant select,insert,delete on public.ai_messages to authenticated;
grant select,insert on public.group_messages to authenticated;
