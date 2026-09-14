grant delete on table public.friendships to authenticated;

drop policy if exists "requesters cancel pending friendships" on public.friendships;
create policy "requesters cancel pending friendships"
  on public.friendships
  for delete
  to authenticated
  using ((select auth.uid())=requester_id and status='pending');
