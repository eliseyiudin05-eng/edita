alter table public.discussion_members enable row level security;
alter table public.discussion_messages enable row level security;

revoke all on table public.discussion_members from anon;
revoke all on table public.discussion_messages from anon;
revoke all on table public.discussion_members from authenticated;
revoke all on table public.discussion_messages from authenticated;
grant select (topic_key, user_id)
  on table public.discussion_members to authenticated;
grant select (id, topic_key, author_id, content, status, created_at)
  on table public.discussion_messages to authenticated;

drop policy if exists "editor discussion own membership select"
  on public.discussion_members;
drop policy if exists "editor discussion own membership boundary"
  on public.discussion_members;
drop policy if exists "editor discussion member message select"
  on public.discussion_messages;
drop policy if exists "editor discussion member message boundary"
  on public.discussion_messages;

create policy "editor discussion own membership select"
  on public.discussion_members
  for select
  to authenticated
  using (
    topic_key = 'editors-in-cinema'
    and user_id = (select auth.uid())
  );

create policy "editor discussion own membership boundary"
  on public.discussion_members
  as restrictive
  for select
  to authenticated
  using (
    topic_key = 'editors-in-cinema'
    and user_id = (select auth.uid())
  );

create policy "editor discussion member message select"
  on public.discussion_messages
  for select
  to authenticated
  using (
    topic_key = 'editors-in-cinema'
    and status = 'published'
    and exists (
      select 1
      from public.discussion_members membership
      where membership.topic_key = 'editors-in-cinema'
        and membership.user_id = (select auth.uid())
    )
  );

create policy "editor discussion member message boundary"
  on public.discussion_messages
  as restrictive
  for select
  to authenticated
  using (
    topic_key = 'editors-in-cinema'
    and status = 'published'
    and exists (
      select 1
      from public.discussion_members membership
      where membership.topic_key = 'editors-in-cinema'
        and membership.user_id = (select auth.uid())
    )
  );
