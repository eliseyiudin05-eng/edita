create index if not exists ai_messages_user_id_idx on public.ai_messages(user_id);

drop policy if exists "users read own ai conversations" on public.ai_conversations;
create policy "users read own ai conversations" on public.ai_conversations for select using((select auth.uid())=user_id);
drop policy if exists "users create own ai conversations" on public.ai_conversations;
create policy "users create own ai conversations" on public.ai_conversations for insert with check((select auth.uid())=user_id);
drop policy if exists "users update own ai conversations" on public.ai_conversations;
create policy "users update own ai conversations" on public.ai_conversations for update using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists "users delete own ai conversations" on public.ai_conversations;
create policy "users delete own ai conversations" on public.ai_conversations for delete using((select auth.uid())=user_id);

drop policy if exists "users read own ai messages" on public.ai_messages;
create policy "users read own ai messages" on public.ai_messages for select using(
  (select auth.uid())=user_id and exists(
    select 1 from public.ai_conversations conversation
    where conversation.id=conversation_id and conversation.user_id=(select auth.uid())
  )
);
drop policy if exists "users create own ai messages" on public.ai_messages;
create policy "users create own ai messages" on public.ai_messages for insert with check(
  (select auth.uid())=user_id and exists(
    select 1 from public.ai_conversations conversation
    where conversation.id=conversation_id and conversation.user_id=(select auth.uid())
  )
);
drop policy if exists "users delete own ai messages" on public.ai_messages;
create policy "users delete own ai messages" on public.ai_messages for delete using(
  (select auth.uid())=user_id and exists(
    select 1 from public.ai_conversations conversation
    where conversation.id=conversation_id and conversation.user_id=(select auth.uid())
  )
);

drop policy if exists "group members read messages" on public.group_messages;
create policy "group members read messages" on public.group_messages for select using(
  exists(
    select 1 from public.study_group_members membership
    where membership.group_id=group_messages.group_id and membership.user_id=(select auth.uid())
  )
);
drop policy if exists "group members create messages" on public.group_messages;
create policy "group members create messages" on public.group_messages for insert with check(
  sender_kind='user' and author_id=(select auth.uid()) and exists(
    select 1 from public.study_group_members membership
    where membership.group_id=group_messages.group_id and membership.user_id=(select auth.uid())
  )
);
