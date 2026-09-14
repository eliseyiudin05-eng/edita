alter table public.discussion_members enable row level security;

revoke insert, update, delete on table public.discussion_members from authenticated;
grant insert (topic_key, user_id)
  on table public.discussion_members to authenticated;

drop policy if exists "editor discussion self enrollment"
  on public.discussion_members;
drop policy if exists "editor discussion self enrollment boundary"
  on public.discussion_members;

create policy "editor discussion self enrollment"
  on public.discussion_members
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and topic_key = 'editors-in-cinema'
  );

create policy "editor discussion self enrollment boundary"
  on public.discussion_members
  as restrictive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and topic_key = 'editors-in-cinema'
  );
