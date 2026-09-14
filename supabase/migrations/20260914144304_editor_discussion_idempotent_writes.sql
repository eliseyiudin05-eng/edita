alter table public.discussion_messages enable row level security;

revoke insert, update, delete on table public.discussion_messages from authenticated;
grant insert (id, topic_key, author_id, content, status)
  on table public.discussion_messages to authenticated;

drop policy if exists "editor discussion member insert"
  on public.discussion_messages;
drop policy if exists "editor discussion member insert boundary"
  on public.discussion_messages;

create policy "editor discussion member insert"
  on public.discussion_messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and author_id = (select auth.uid())
    and topic_key = 'editors-in-cinema'
    and status = 'published'
    and exists (
      select 1
      from public.discussion_members
      where discussion_members.user_id = (select auth.uid())
        and discussion_members.topic_key = 'editors-in-cinema'
    )
  );

create policy "editor discussion member insert boundary"
  on public.discussion_messages
  as restrictive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and author_id = (select auth.uid())
    and topic_key = 'editors-in-cinema'
    and status = 'published'
    and exists (
      select 1
      from public.discussion_members
      where discussion_members.user_id = (select auth.uid())
        and discussion_members.topic_key = 'editors-in-cinema'
    )
  );
