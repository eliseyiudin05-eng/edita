-- Complete the public KIVROX rename and keep rewards single-award and server-controlled.

update public.learning_competitions
set slug=replace(slug,'edita-','kivrox-'),
    title=replace(title,'EDITA','KIVROX'),
    description=replace(description,'EDITA','KIVROX'),
    task=replace(task,'EDITA','KIVROX'),
    social_tag=case when social_tag ilike '%edita%' then '@KIVROX' else social_tag end
where slug like 'edita-%'
   or title like '%EDITA%'
   or description like '%EDITA%'
   or task like '%EDITA%'
   or social_tag ilike '%edita%';

update public.beta_programs
set title=replace(title,'EDITA','KIVROX')
where title like '%EDITA%';

update public.private_conversations
set source_kind='kivrox_contest',
    company_name=replace(company_name,'EDITA','KIVROX'),
    title=replace(title,'EDITA','KIVROX')
where source_kind='edita_contest'
   or company_name like '%EDITA%'
   or title like '%EDITA%';

alter table public.private_conversations
  drop constraint if exists private_conversations_source_kind_check;
alter table public.private_conversations
  add constraint private_conversations_source_kind_check
  check (source_kind in ('campaign','challenge','job','kivrox_contest'));

-- Referral qualification changes state only. A single trigger owns every reward.
create or replace function public.qualify_referral_after_lessons()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  completed_count integer;
  referral_id uuid;
begin
  if new.status<>'completed' then return new; end if;

  select count(*) into completed_count
  from public.lesson_progress
  where user_id=new.user_id and status='completed';
  if completed_count<3 then return new; end if;

  select id into referral_id
  from public.referrals
  where referred_id=new.user_id and status='pending'
  order by created_at
  limit 1
  for update;
  if referral_id is null then return new; end if;

  update public.referrals
  set status='qualified',qualified_at=now()
  where id=referral_id and status='pending';
  return new;
end;
$$;

drop trigger if exists referral_qualified_reward on public.referrals;
drop trigger if exists award_kivrox_referral_points_after_qualification on public.referrals;
drop function if exists public.reward_qualified_referral();

create or replace function private.award_kivrox_referral_points()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  awarded record;
begin
  if new.status='qualified' and old.status is distinct from 'qualified' then
    for awarded in
      with inserted as (
        insert into public.referral_reward_events(referral_id,user_id,points)
        values (new.id,new.referrer_id,500),(new.id,new.referred_id,250)
        on conflict (referral_id,user_id) do nothing
        returning user_id,points
      )
      select user_id,points from inserted
    loop
      update public.profiles
      set referral_points=referral_points+awarded.points,
          xp=xp+case when awarded.user_id=new.referrer_id then 150 else 50 end
      where id=awarded.user_id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger award_kivrox_referral_points_after_qualification
after update of status on public.referrals
for each row execute function private.award_kivrox_referral_points();

drop function if exists public.redeem_referral_ai_pro(uuid);
create or replace function public.redeem_kivrox_points(p_user_id uuid,p_reward text)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  current_points integer;
  current_exp timestamptz;
  current_role public.user_role;
  reward_cost integer;
  next_plan text;
  new_exp timestamptz;
begin
  if p_reward='creator_plus_30' then
    reward_cost:=500;
    next_plan:='creator_plus';
  else
    raise exception 'UNKNOWN_REWARD';
  end if;

  select referral_points,plan_expires_at,role
  into current_points,current_exp,current_role
  from public.profiles
  where id=p_user_id
  for update;
  if current_role is distinct from 'editor'::public.user_role then raise exception 'EDITOR_REWARD_ONLY'; end if;
  if current_points<reward_cost then raise exception 'NOT_ENOUGH_POINTS'; end if;

  new_exp:=greatest(now(),coalesce(current_exp,now()))+interval '30 days';
  update public.profiles
  set referral_points=referral_points-reward_cost,
      plan=next_plan,
      plan_expires_at=new_exp
  where id=p_user_id;

  insert into public.referral_redemptions(user_id,points_spent,reward)
  values(p_user_id,reward_cost,p_reward);
  return new_exp;
end;
$$;
revoke all on function public.redeem_kivrox_points(uuid,text) from public,anon,authenticated;
grant execute on function public.redeem_kivrox_points(uuid,text) to service_role;

-- Points promised by a company challenge are credited once per challenge.
create table if not exists public.challenge_reward_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.challenge_submissions(id) on delete cascade,
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check(points>0),
  created_at timestamptz not null default now()
);
alter table public.challenge_reward_events enable row level security;
drop policy if exists "challenge rewards are server only" on public.challenge_reward_events;
create policy "challenge rewards are server only"
on public.challenge_reward_events for all to anon,authenticated
using(false) with check(false);
revoke all on table public.challenge_reward_events from anon,authenticated;
grant all on table public.challenge_reward_events to service_role;

create or replace function private.award_challenge_kivrox_points()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  reward integer;
  inserted_count integer;
begin
  if new.status='winner' and (tg_op='INSERT' or old.status is distinct from 'winner') then
    select prize_points into reward from public.challenges where id=new.challenge_id;
    if coalesce(reward,0)>0 then
      insert into public.challenge_reward_events(submission_id,challenge_id,user_id,points)
      values(new.id,new.challenge_id,new.editor_id,reward)
      on conflict (challenge_id) do nothing;
      get diagnostics inserted_count=row_count;
      if inserted_count=1 then
        update public.profiles
        set referral_points=referral_points+reward
        where id=new.editor_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists award_challenge_kivrox_points_after_win on public.challenge_submissions;
create trigger award_challenge_kivrox_points_after_win
after insert or update of status on public.challenge_submissions
for each row execute function private.award_challenge_kivrox_points();

-- Explicit deny policies document tables that are reachable only through server routes.
drop policy if exists "beta programs are server only" on public.beta_programs;
create policy "beta programs are server only" on public.beta_programs
for all to anon,authenticated using(false) with check(false);
drop policy if exists "beta codes are server only" on public.beta_access_codes;
create policy "beta codes are server only" on public.beta_access_codes
for all to anon,authenticated using(false) with check(false);

revoke delete,truncate,references,trigger on public.future_plan_interest from authenticated;
revoke delete,truncate,references,trigger on public.ai_feedback from authenticated;
