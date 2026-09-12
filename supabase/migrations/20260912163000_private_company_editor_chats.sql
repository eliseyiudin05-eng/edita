create table if not exists public.private_conversations(
  id uuid primary key default gen_random_uuid(),
  editor_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  business_owner_id uuid not null references public.profiles(id) on delete cascade,
  source_kind text not null check(source_kind in ('campaign','challenge','job','edita_contest')),
  source_id uuid not null,
  company_name text not null check(char_length(company_name) between 1 and 160),
  title text not null check(char_length(title) between 1 and 180),
  status text not null default 'active' check(status in ('active','closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(source_kind,source_id,editor_id)
);

create table if not exists public.private_messages(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists private_conversations_editor_recent_idx
  on public.private_conversations(editor_id,last_message_at desc);
create index if not exists private_conversations_owner_recent_idx
  on public.private_conversations(business_owner_id,last_message_at desc);
create index if not exists private_messages_conversation_recent_idx
  on public.private_messages(conversation_id,created_at,id);

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

create or replace function private.edita_message_has_contact_info(message text)
returns boolean
language sql
immutable
strict
set search_path=''
as $function$
  select
    message ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    or message ~* '[+]?([0-9][[:space:]().-]*){7,}'
    or message ~* '(https?://|www[.]|t[.]me|wa[.]me|vk[.]com|discord[.]gg)'
    or message ~* '(^|[^[:alnum:]_])@[[:alnum:]_.-]{3,}'
    or message ~* '(telegram|телеграм|whatsapp|ватсап|viber|вайбер|discord|дискорд|instagram|инстаграм|вконтакте)';
$function$;

revoke all on function private.edita_message_has_contact_info(text) from public,anon,authenticated;
grant execute on function private.edita_message_has_contact_info(text) to service_role;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='private_messages_contact_guard') then
    alter table public.private_messages
      add constraint private_messages_contact_guard
      check(not private.edita_message_has_contact_info(body));
  end if;
end $$;

alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;

drop policy if exists "chat participants read conversations" on public.private_conversations;
create policy "chat participants read conversations"
on public.private_conversations
for select
to authenticated
using(
  (select auth.uid())=editor_id
  or (select auth.uid())=business_owner_id
);

drop policy if exists "chat participants read messages" on public.private_messages;
create policy "chat participants read messages"
on public.private_messages
for select
to authenticated
using(
  exists(
    select 1
    from public.private_conversations conversation
    where conversation.id=private_messages.conversation_id
      and (
        conversation.editor_id=(select auth.uid())
        or conversation.business_owner_id=(select auth.uid())
      )
  )
);

revoke all on public.private_conversations from anon,authenticated;
revoke all on public.private_messages from anon,authenticated;
grant select on public.private_conversations to authenticated;
grant select on public.private_messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.private_messages;
exception
  when duplicate_object then null;
end $$;
