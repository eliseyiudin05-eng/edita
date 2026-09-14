alter table public.business_discussion_messages enable row level security;

revoke all on table public.business_discussion_messages from anon;
revoke all on table public.business_discussion_messages from authenticated;
grant select (id, topic_key, author_id, content, status, created_at)
  on table public.business_discussion_messages to authenticated;

drop policy if exists "business discussion deny direct access"
  on public.business_discussion_messages;
drop policy if exists "business discussion business select"
  on public.business_discussion_messages;
drop policy if exists "business discussion business select boundary"
  on public.business_discussion_messages;

create policy "business discussion business select"
  on public.business_discussion_messages
  for select
  to authenticated
  using (
    topic_key = 'company-growth'
    and status = 'published'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'business'
    )
  );

create policy "business discussion business select boundary"
  on public.business_discussion_messages
  as restrictive
  for select
  to authenticated
  using (
    topic_key = 'company-growth'
    and status = 'published'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'business'
    )
  );
