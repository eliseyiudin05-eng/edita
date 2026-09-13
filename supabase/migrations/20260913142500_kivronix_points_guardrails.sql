-- Protect KIVRONIX Points from self-awards and lock published reward terms.
alter table public.challenges
  drop constraint if exists challenges_prize_points_check;
alter table public.challenges
  add constraint challenges_prize_points_check
  check(prize_points between 0 and 5000);

drop policy if exists "business creates challenges" on public.challenges;
create policy "business creates challenges"
on public.challenges for insert to authenticated
with check(exists(
  select 1
  from public.businesses business
  where business.id=business_id
    and business.owner_id=(select auth.uid())
    and business.verified=true
));

drop policy if exists "business updates challenges" on public.challenges;
create policy "business updates challenges"
on public.challenges for update to authenticated
using(exists(
  select 1
  from public.businesses business
  where business.id=business_id
    and business.owner_id=(select auth.uid())
    and business.verified=true
))
with check(exists(
  select 1
  from public.businesses business
  where business.id=business_id
    and business.owner_id=(select auth.uid())
    and business.verified=true
));

drop policy if exists "own submissions" on public.challenge_submissions;
drop policy if exists "editors read own challenge submissions" on public.challenge_submissions;
drop policy if exists "editors create own challenge submissions" on public.challenge_submissions;
drop policy if exists "editors update own submitted reviews" on public.challenge_submissions;
drop policy if exists "editors delete own submitted entries" on public.challenge_submissions;

create policy "editors read own challenge submissions"
on public.challenge_submissions for select to authenticated
using((select auth.uid())=editor_id);

create policy "editors create own challenge submissions"
on public.challenge_submissions for insert to authenticated
with check(
  (select auth.uid())=editor_id
  and status='submitted'
  and exists(
    select 1 from public.challenges challenge
    where challenge.id=challenge_id and challenge.status='open'
  )
);

create policy "editors update own submitted reviews"
on public.challenge_submissions for update to authenticated
using((select auth.uid())=editor_id and status='submitted')
with check((select auth.uid())=editor_id and status='submitted');

create policy "editors delete own submitted entries"
on public.challenge_submissions for delete to authenticated
using((select auth.uid())=editor_id and status='submitted');

create or replace function private.protect_kivronix_challenge_rewards()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if (new.prize_cents,new.prize_points,new.custom_prize,new.business_id)
       is distinct from
     (old.prize_cents,old.prize_points,old.custom_prize,old.business_id)
     and exists(
       select 1 from public.challenge_submissions submission
       where submission.challenge_id=old.id
     ) then
    raise exception 'CHALLENGE_REWARD_LOCKED';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_kivronix_challenge_rewards()
  from public, anon, authenticated;
grant execute on function private.protect_kivronix_challenge_rewards()
  to service_role;

drop trigger if exists protect_kivronix_challenge_rewards_before_update
  on public.challenges;
create trigger protect_kivronix_challenge_rewards_before_update
before update of prize_cents,prize_points,custom_prize,business_id
on public.challenges
for each row execute function private.protect_kivronix_challenge_rewards();
