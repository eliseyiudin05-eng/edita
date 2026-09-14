revoke update on table public.friendships from authenticated;
grant update(status,responded_at) on table public.friendships to authenticated;

drop policy if exists "addressees respond to pending friendships" on public.friendships;
create policy "addressees respond to pending friendships"
  on public.friendships
  for update
  to authenticated
  using ((select auth.uid())=addressee_id and status='pending')
  with check (
    (select auth.uid())=addressee_id
    and status in ('accepted','declined')
    and responded_at is not null
  );
