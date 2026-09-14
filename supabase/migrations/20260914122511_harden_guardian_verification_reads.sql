do $$
begin
  if to_regclass('public.guardian_verification_requests') is null then
    raise exception 'public.guardian_verification_requests must exist before hardening reads';
  end if;
end
$$;

alter table public.guardian_verification_requests enable row level security;

revoke all on table public.guardian_verification_requests from anon;
revoke all on table public.guardian_verification_requests from authenticated;
grant select (id, user_id, status, review_note, created_at)
  on table public.guardian_verification_requests to authenticated;

drop policy if exists "guardian verification owner select"
  on public.guardian_verification_requests;
drop policy if exists "guardian verification owner select boundary"
  on public.guardian_verification_requests;

create policy "guardian verification owner select"
  on public.guardian_verification_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "guardian verification owner select boundary"
  on public.guardian_verification_requests
  as restrictive
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
