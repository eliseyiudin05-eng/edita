-- Consolidate challenge submission policies and cover reward-event lookups.
create index if not exists challenge_reward_events_user_id_idx
  on public.challenge_reward_events(user_id);

drop policy if exists "own submissions insert" on public.challenge_submissions;
drop policy if exists "own submissions read" on public.challenge_submissions;
drop policy if exists "own submissions ai update" on public.challenge_submissions;
drop policy if exists "business reads challenge submissions" on public.challenge_submissions;
drop policy if exists "business updates challenge submissions" on public.challenge_submissions;
drop policy if exists "editors create own challenge submissions" on public.challenge_submissions;
drop policy if exists "editors read own challenge submissions" on public.challenge_submissions;
drop policy if exists "editors update own submitted reviews" on public.challenge_submissions;
drop policy if exists "challenge submissions readable" on public.challenge_submissions;
drop policy if exists "challenge submissions updateable" on public.challenge_submissions;

create policy "editors create own challenge submissions"
on public.challenge_submissions for insert to authenticated
with check(
  (select auth.uid())=editor_id
  and status='submitted'
  and exists(
    select 1 from public.profiles profile
    where profile.id=(select auth.uid()) and profile.role='editor'
  )
  and exists(
    select 1 from public.challenges challenge
    where challenge.id=challenge_id and challenge.status='open'
  )
  and not exists(
    select 1
    from public.challenges challenge
    join public.businesses business on business.id=challenge.business_id
    where challenge.id=challenge_id and business.owner_id=(select auth.uid())
  )
);

create policy "challenge submissions readable"
on public.challenge_submissions for select to authenticated
using(
  (select auth.uid())=editor_id
  or exists(
    select 1
    from public.challenges challenge
    join public.businesses business on business.id=challenge.business_id
    where challenge.id=challenge_id and business.owner_id=(select auth.uid())
  )
);

create policy "challenge submissions updateable"
on public.challenge_submissions for update to authenticated
using(
  ((select auth.uid())=editor_id and status='submitted')
  or exists(
    select 1
    from public.challenges challenge
    join public.businesses business on business.id=challenge.business_id
    where challenge.id=challenge_id and business.owner_id=(select auth.uid())
  )
)
with check(
  ((select auth.uid())=editor_id and status='submitted')
  or exists(
    select 1
    from public.challenges challenge
    join public.businesses business on business.id=challenge.business_id
    where challenge.id=challenge_id and business.owner_id=(select auth.uid())
  )
);
