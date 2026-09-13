create or replace function public.is_current_user_study_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.study_group_members membership
    where membership.group_id=p_group_id
      and membership.user_id=(select auth.uid())
  );
$$;

revoke all on function public.is_current_user_study_group_member(uuid) from public;
grant execute on function public.is_current_user_study_group_member(uuid) to authenticated;

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;

do $$
declare existing_policy record;
begin
  for existing_policy in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public' and tablename in ('study_groups','study_group_members')
  loop
    execute format('drop policy %I on %I.%I',existing_policy.policyname,existing_policy.schemaname,existing_policy.tablename);
  end loop;
end $$;

revoke all on table public.study_groups from anon,authenticated;
revoke all on table public.study_group_members from anon,authenticated;
grant select on table public.study_groups to authenticated;
grant select on table public.study_group_members to authenticated;

create policy "members read own study groups"
  on public.study_groups
  for select
  to authenticated
  using (public.is_current_user_study_group_member(id));

create policy "members read members of own groups"
  on public.study_group_members
  for select
  to authenticated
  using (public.is_current_user_study_group_member(group_id));

