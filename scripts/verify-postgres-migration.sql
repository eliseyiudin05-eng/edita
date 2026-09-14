\set ON_ERROR_STOP on

do $$
declare
  orphan_count bigint;
begin
  select count(*) into orphan_count from public.profiles p left join public.app_users u on u.id=p.id where u.id is null;
  if orphan_count <> 0 then raise exception 'orphan profiles: %', orphan_count; end if;

  select count(*) into orphan_count from public.private_messages m left join public.private_conversations c on c.id=m.conversation_id where c.id is null;
  if orphan_count <> 0 then raise exception 'orphan private messages: %', orphan_count; end if;

  select count(*) into orphan_count from public.work_orders o left join public.work_wallets w on w.user_id=o.customer_id where w.user_id is null;
  if orphan_count <> 0 then raise exception 'work orders without customer wallet: %', orphan_count; end if;

  select count(*) into orphan_count from public.referral_reward_events e left join public.referrals r on r.id=e.referral_id where r.id is null;
  if orphan_count <> 0 then raise exception 'orphan referral rewards: %', orphan_count; end if;

  select count(*) into orphan_count from public.beta_members m
    left join public.beta_programs p on p.id=m.program_id
    left join public.beta_access_codes c on c.id=m.access_code_id
    where p.id is null or c.id is null or c.program_id<>m.program_id;
  if orphan_count <> 0 then raise exception 'invalid beta memberships: %', orphan_count; end if;

  select count(*) into orphan_count from public.point_topups t
    left join public.work_point_events e on e.topup_id=t.id and e.kind='topup'
    where t.status='succeeded' and e.id is null;
  if orphan_count <> 0 then raise exception 'succeeded topups without ledger event: %', orphan_count; end if;

  select count(*) into orphan_count from public.business_campaign_applications a
    left join public.business_campaigns c on c.id=a.campaign_id
    left join public.profiles p on p.id=a.editor_id
    where c.id is null or p.id is null;
  if orphan_count <> 0 then raise exception 'orphan campaign applications: %', orphan_count; end if;

  select count(*) into orphan_count from public.challenge_submissions s
    left join public.challenges c on c.id=s.challenge_id
    left join public.profiles p on p.id=s.editor_id
    where c.id is null or p.id is null;
  if orphan_count <> 0 then raise exception 'orphan challenge submissions: %', orphan_count; end if;

  select count(*) into orphan_count from (
    select challenge_id from public.challenge_submissions
    where status='winner' group by challenge_id having count(*)>1
  ) duplicate_winners;
  if orphan_count <> 0 then raise exception 'challenges with multiple winners: %', orphan_count; end if;

  select count(*) into orphan_count from public.challenge_reward_events reward
    join public.challenge_submissions submission on submission.id=reward.submission_id
    where reward.challenge_id<>submission.challenge_id or reward.user_id<>submission.editor_id
      or submission.status<>'winner';
  if orphan_count <> 0 then raise exception 'invalid challenge Points rewards: %', orphan_count; end if;

  select count(*) into orphan_count from public.challenge_cash_reward_events reward
    join public.challenge_submissions submission on submission.id=reward.submission_id
    where reward.challenge_id<>submission.challenge_id or reward.user_id<>submission.editor_id
      or submission.status<>'winner';
  if orphan_count <> 0 then raise exception 'invalid challenge cash rewards: %', orphan_count; end if;
end $$;

select 'app_users' as entity,count(*) as rows from public.app_users
union all select 'profiles',count(*) from public.profiles
union all select 'businesses',count(*) from public.businesses
union all select 'private_messages',count(*) from public.private_messages
union all select 'work_orders',count(*) from public.work_orders
union all select 'point_topups',count(*) from public.point_topups
union all select 'reward_events',count(*) from public.referral_reward_events
union all select 'beta_members',count(*) from public.beta_members
union all select 'business_campaigns',count(*) from public.business_campaigns
union all select 'campaign_applications',count(*) from public.business_campaign_applications
union all select 'challenges',count(*) from public.challenges
union all select 'challenge_submissions',count(*) from public.challenge_submissions
union all select 'objects',count(*) from public.objects
order by entity;
