revoke update on table public.profiles from authenticated;
grant update(display_name,username,avatar_url,school_name,show_school_publicly,onboarding)
on table public.profiles to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid())=id)
with check ((select auth.uid())=id);
