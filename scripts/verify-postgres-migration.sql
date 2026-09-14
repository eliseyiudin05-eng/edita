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
end $$;

select 'app_users' as entity,count(*) as rows from public.app_users
union all select 'profiles',count(*) from public.profiles
union all select 'businesses',count(*) from public.businesses
union all select 'private_messages',count(*) from public.private_messages
union all select 'work_orders',count(*) from public.work_orders
union all select 'point_topups',count(*) from public.point_topups
union all select 'reward_events',count(*) from public.referral_reward_events
union all select 'beta_members',count(*) from public.beta_members
union all select 'objects',count(*) from public.objects
order by entity;
