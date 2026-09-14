alter table public.practice_sessions enable row level security;

revoke all on table public.practice_sessions from anon, authenticated;
grant select on table public.practice_sessions to authenticated;
grant insert(user_id,scenario,messages,result,updated_at) on public.practice_sessions to authenticated;
grant update(scenario,messages,result,updated_at) on public.practice_sessions to authenticated;

drop policy if exists "users read own practice" on public.practice_sessions;
drop policy if exists "users insert own practice" on public.practice_sessions;
drop policy if exists "users update own practice" on public.practice_sessions;
drop policy if exists "users delete own practice" on public.practice_sessions;

create policy "users read own practice"
  on public.practice_sessions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "users insert own practice"
  on public.practice_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "users update own practice"
  on public.practice_sessions
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
