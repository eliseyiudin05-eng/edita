-- v2.0.0-alpha.15: protect company challenges, submissions and winner rewards for the Go API.

alter table public.challenges
  add constraint challenges_title_contract check (char_length(btrim(title)) between 3 and 120) not valid,
  add constraint challenges_brief_contract check (char_length(btrim(brief)) between 10 and 5000) not valid,
  add constraint challenges_prize_cash_contract check (prize_cents between 0 and 100000000) not valid,
  add constraint challenges_prize_points_contract check (prize_points between 0 and 5000) not valid,
  add constraint challenges_reward_contract check (
    prize_cents>0 or prize_points>0 or nullif(btrim(custom_prize),'') is not null
  ) not valid,
  add constraint challenges_status_contract check (status in ('draft','open','closed','cancelled')) not valid,
  add constraint challenges_ends_contract check (ends_at is null or ends_at>created_at) not valid,
  add constraint challenges_assets_contract check (
    jsonb_typeof(source_assets)='array' and jsonb_array_length(source_assets)<=8
  ) not valid;

alter table public.challenge_submissions
  add column if not exists object_id uuid references public.objects(id) on delete restrict,
  add constraint challenge_submissions_status_contract
  check (status in ('submitted','shortlisted','winner','declined')) not valid,
  add constraint challenge_submissions_video_contract
  check (char_length(video_url) between 1 and 1000) not valid;

alter table public.portfolio_items
  add column if not exists source_kind text,
  add column if not exists source_id uuid,
  add constraint portfolio_items_source_pair_contract check (
    (source_kind is null and source_id is null) or (source_kind is not null and source_id is not null)
  ) not valid,
  add constraint portfolio_items_source_kind_contract check (
    source_kind is null or source_kind in ('challenge','job','campaign')
  ) not valid;

do $$
begin
  if exists(
    select 1 from public.challenge_submissions
    where status='winner' group by challenge_id having count(*)>1
  ) then
    raise exception 'CHALLENGE_MULTIPLE_WINNERS';
  end if;
  if exists(
    select 1 from public.challenge_reward_events reward
    join public.challenge_submissions submission on submission.id=reward.submission_id
    where reward.challenge_id<>submission.challenge_id or reward.user_id<>submission.editor_id
      or submission.status<>'winner'
  ) or exists(
    select 1 from public.challenge_cash_reward_events reward
    join public.challenge_submissions submission on submission.id=reward.submission_id
    where reward.challenge_id<>submission.challenge_id or reward.user_id<>submission.editor_id
      or submission.status<>'winner'
  ) then
    raise exception 'CHALLENGE_REWARD_INCONSISTENT';
  end if;
end $$;

create unique index if not exists challenge_submissions_one_winner_idx
  on public.challenge_submissions(challenge_id)
  where status='winner';

create unique index if not exists portfolio_items_source_unique_idx
  on public.portfolio_items(source_kind,source_id)
  where source_kind is not null and source_id is not null;

create index if not exists challenges_open_created_idx
  on public.challenges(created_at desc,id)
  where status='open';

create index if not exists challenge_submissions_challenge_created_idx
  on public.challenge_submissions(challenge_id,created_at desc,id);

create index if not exists challenge_submissions_object_idx
  on public.challenge_submissions(object_id)
  where object_id is not null;

create or replace function app_private.protect_challenge_rewards()
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

revoke all on function app_private.protect_challenge_rewards() from public;

drop trigger if exists protect_challenge_rewards_before_update on public.challenges;
create trigger protect_challenge_rewards_before_update
before update of prize_cents,prize_points,custom_prize,business_id
on public.challenges
for each row execute function app_private.protect_challenge_rewards();

revoke all on public.challenges,public.challenge_submissions,public.portfolio_items,
  public.challenge_reward_events,public.challenge_cash_reward_events from public;
