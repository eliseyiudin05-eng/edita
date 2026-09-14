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
end $$;

select 'app_users' as entity,count(*) as rows from public.app_users
union all select 'profiles',count(*) from public.profiles
union all select 'businesses',count(*) from public.businesses
union all select 'private_messages',count(*) from public.private_messages
union all select 'work_orders',count(*) from public.work_orders
union all select 'objects',count(*) from public.objects
order by entity;
