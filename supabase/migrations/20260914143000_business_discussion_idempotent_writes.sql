alter table public.business_discussion_messages enable row level security;

revoke insert, update, delete on table public.business_discussion_messages from authenticated;
grant insert (id, topic_key, author_id, content, status)
  on table public.business_discussion_messages to authenticated;

drop policy if exists "business discussion business insert"
  on public.business_discussion_messages;
drop policy if exists "business discussion business insert boundary"
  on public.business_discussion_messages;

create policy "business discussion business insert"
  on public.business_discussion_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and topic_key = 'company-growth'
    and status = 'published'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'business'
    )
  );

create policy "business discussion business insert boundary"
  on public.business_discussion_messages
  as restrictive
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and topic_key = 'company-growth'
    and status = 'published'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'business'
    )
  );
