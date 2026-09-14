do $$
begin
  if to_regclass('public.editor_verification_requests') is null then
    raise exception 'public.editor_verification_requests must exist before applying this migration';
  end if;
end
$$;

alter table public.editor_verification_requests enable row level security;

revoke all on table public.editor_verification_requests from anon;
revoke all on table public.editor_verification_requests from authenticated;
grant select on table public.editor_verification_requests to authenticated;

drop policy if exists "editor verification owner select" on public.editor_verification_requests;
drop policy if exists "editor verification owner select boundary" on public.editor_verification_requests;

create policy "editor verification owner select"
on public.editor_verification_requests
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "editor verification owner select boundary"
on public.editor_verification_requests
as restrictive
for select
to authenticated
using ((select auth.uid()) = user_id);
