update public.work_orders
set platform_fee_points=0, editor_points=gross_points
where status in ('funded','submitted');

create or replace function public.reserve_job_points(p_customer uuid,p_job uuid,p_editor uuid,p_conversation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.work_wallets%rowtype; j public.jobs%rowtype; order_id uuid;
begin
  select id into order_id from public.work_orders where job_id=p_job;
  if order_id is not null then return order_id; end if;
  select * into j from public.jobs where id=p_job for update;
  if j.payment_points<100 then raise exception 'POINT_PRICE_REQUIRED'; end if;
  insert into public.work_wallets(user_id) values(p_customer) on conflict do nothing;
  select * into w from public.work_wallets where user_id=p_customer for update;
  if w.available_points<j.payment_points then raise exception 'NOT_ENOUGH_WORK_POINTS'; end if;
  update public.work_wallets set available_points=available_points-j.payment_points,reserved_points=reserved_points+j.payment_points,updated_at=now() where user_id=p_customer;
  insert into public.work_orders(job_id,customer_id,editor_id,conversation_id,gross_points,platform_fee_points,editor_points)
  values(p_job,p_customer,p_editor,p_conversation,j.payment_points,0,j.payment_points)
  on conflict(job_id) do update set editor_id=excluded.editor_id,conversation_id=excluded.conversation_id,platform_fee_points=0,editor_points=excluded.gross_points
  returning id into order_id;
  insert into public.work_point_events(user_id,work_order_id,kind,points) values(p_customer,order_id,'reserve',-j.payment_points);
  return order_id;
end $$;
revoke all on function public.reserve_job_points(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_job_points(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.complete_work_order(p_customer uuid,p_order uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o public.work_orders%rowtype;
begin
  select * into o from public.work_orders where id=p_order and customer_id=p_customer for update;
  if o.id is null or o.status not in ('funded','submitted') then raise exception 'ORDER_NOT_COMPLETABLE'; end if;
  insert into public.work_wallets(user_id) values(o.editor_id) on conflict do nothing;
  update public.work_wallets set reserved_points=reserved_points-o.gross_points,updated_at=now() where user_id=o.customer_id;
  update public.work_wallets set available_points=available_points+o.gross_points,updated_at=now() where user_id=o.editor_id;
  update public.work_orders set status='completed',platform_fee_points=0,editor_points=gross_points,completed_at=now() where id=o.id;
  insert into public.work_point_events(user_id,work_order_id,kind,points) values(o.editor_id,o.id,'earning',o.gross_points);
end $$;
revoke all on function public.complete_work_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_work_order(uuid,uuid) to service_role;
