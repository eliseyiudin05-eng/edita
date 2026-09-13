-- Award the promised welcome points exactly once when an editor answers the
-- motivation question during signup. The ledger keeps the award auditable and
-- prevents accidental repeats.
create table if not exists public.signup_reward_events (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('editor_motivation')),
  points integer not null check (points between 1 and 100),
  created_at timestamptz not null default now()
);

alter table public.signup_reward_events enable row level security;
revoke all on public.signup_reward_events from public,anon,authenticated;
grant all on public.signup_reward_events to service_role;

drop policy if exists "signup rewards are server only" on public.signup_reward_events;
create policy "signup rewards are server only"
on public.signup_reward_events for all to anon,authenticated
using (false) with check (false);

create or replace function private.award_editor_motivation_points()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  awarded_user uuid;
begin
  if new.raw_user_meta_data->>'role'='editor'
     and char_length(trim(coalesce(new.raw_user_meta_data->'onboarding'->>'motivation','')))>=5 then
    insert into public.signup_reward_events(user_id,reason,points)
    values(new.id,'editor_motivation',5)
    on conflict(user_id) do nothing
    returning user_id into awarded_user;

    if awarded_user is not null then
      update public.profiles
      set referral_points=referral_points+5
      where id=new.id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.award_editor_motivation_points()
from public,anon,authenticated;
grant execute on function private.award_editor_motivation_points()
to service_role;

drop trigger if exists zz_award_editor_motivation_points on auth.users;
create trigger zz_award_editor_motivation_points
after insert on auth.users
for each row execute function private.award_editor_motivation_points();
