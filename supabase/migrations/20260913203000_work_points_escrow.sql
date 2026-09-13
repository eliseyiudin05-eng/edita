alter table public.jobs add column if not exists payment_points integer not null default 0;
alter table public.jobs drop constraint if exists jobs_payment_points_check;
alter table public.jobs add constraint jobs_payment_points_check check(payment_points between 0 and 10000000);

create table if not exists public.work_wallets(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_points bigint not null default 0 check(available_points>=0),
  reserved_points bigint not null default 0 check(reserved_points>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.work_orders(
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  editor_id uuid not null references public.profiles(id),
  conversation_id uuid unique references public.private_conversations(id),
  gross_points integer not null check(gross_points>0),
  platform_fee_points integer not null check(platform_fee_points>=0),
  editor_points integer not null check(editor_points>0),
  status text not null default 'funded' check(status in ('funded','submitted','completed','disputed','cancelled')),
  submitted_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.point_topups(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  points integer not null check(points between 100 and 1000000), amount_cents bigint not null,
  provider text not null default 'yookassa', provider_payment_id text unique,
  status text not null default 'pending' check(status in ('pending','succeeded','cancelled')),
  created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.work_point_events(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  work_order_id uuid references public.work_orders(id), topup_id uuid references public.point_topups(id),
  kind text not null check(kind in ('topup','reserve','release','earning','fee','refund')),
  points bigint not null, created_at timestamptz not null default now()
);
create unique index if not exists work_point_events_one_topup_idx on public.work_point_events(topup_id) where topup_id is not null and kind='topup';

alter table public.work_wallets enable row level security;
alter table public.work_orders enable row level security;
alter table public.point_topups enable row level security;
alter table public.work_point_events enable row level security;
create policy "own wallet read" on public.work_wallets for select to authenticated using(user_id=(select auth.uid()));
create policy "participants read work order" on public.work_orders for select to authenticated using(customer_id=(select auth.uid()) or editor_id=(select auth.uid()));
create policy "own topups read" on public.point_topups for select to authenticated using(user_id=(select auth.uid()));
create policy "own point events read" on public.work_point_events for select to authenticated using(user_id=(select auth.uid()));
grant select on public.work_wallets,public.work_orders,public.point_topups,public.work_point_events to authenticated;
grant all on public.work_wallets,public.work_orders,public.point_topups,public.work_point_events to service_role;

create or replace function public.reserve_job_points(p_customer uuid,p_job uuid,p_editor uuid,p_conversation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.work_wallets%rowtype; j public.jobs%rowtype; order_id uuid; fee integer;
begin
  select id into order_id from public.work_orders where job_id=p_job;
  if order_id is not null then return order_id; end if;
  select * into j from public.jobs where id=p_job for update;
  if j.payment_points<100 then raise exception 'POINT_PRICE_REQUIRED'; end if;
  insert into public.work_wallets(user_id) values(p_customer) on conflict do nothing;
  select * into w from public.work_wallets where user_id=p_customer for update;
  if w.available_points<j.payment_points then raise exception 'NOT_ENOUGH_WORK_POINTS'; end if;
  fee:=ceil(j.payment_points*0.12);
  update public.work_wallets set available_points=available_points-j.payment_points,reserved_points=reserved_points+j.payment_points,updated_at=now() where user_id=p_customer;
  insert into public.work_orders(job_id,customer_id,editor_id,conversation_id,gross_points,platform_fee_points,editor_points)
  values(p_job,p_customer,p_editor,p_conversation,j.payment_points,fee,j.payment_points-fee)
  on conflict(job_id) do update set editor_id=excluded.editor_id,conversation_id=excluded.conversation_id
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
  update public.work_wallets set available_points=available_points+o.editor_points,updated_at=now() where user_id=o.editor_id;
  update public.work_orders set status='completed',completed_at=now() where id=o.id;
  insert into public.work_point_events(user_id,work_order_id,kind,points) values(o.editor_id,o.id,'earning',o.editor_points),(o.customer_id,o.id,'fee',-o.platform_fee_points);
end $$;
revoke all on function public.complete_work_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_work_order(uuid,uuid) to service_role;

create or replace function public.credit_work_points(p_user uuid,p_topup uuid,p_points integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.point_topups where id=p_topup and user_id=p_user and status='succeeded' and points=p_points) then raise exception 'INVALID_TOPUP'; end if;
  if exists(select 1 from public.work_point_events where topup_id=p_topup and kind='topup') then return; end if;
  insert into public.work_wallets(user_id) values(p_user) on conflict do nothing;
  update public.work_wallets set available_points=available_points+p_points,updated_at=now() where user_id=p_user;
  insert into public.work_point_events(user_id,topup_id,kind,points) values(p_user,p_topup,'topup',p_points);
end $$;
revoke all on function public.credit_work_points(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.credit_work_points(uuid,uuid,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('work-files','work-files',false,104857600,array['video/mp4','video/quicktime','video/webm','application/zip','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=104857600;
create policy "work participants upload" on storage.objects for insert to authenticated with check(
 bucket_id='work-files' and exists(select 1 from public.private_conversations c where c.id::text=(storage.foldername(name))[1] and (c.editor_id=(select auth.uid()) or c.business_owner_id=(select auth.uid())))
);
create policy "work participants read" on storage.objects for select to authenticated using(
 bucket_id='work-files' and exists(select 1 from public.private_conversations c where c.id::text=(storage.foldername(name))[1] and (c.editor_id=(select auth.uid()) or c.business_owner_id=(select auth.uid())))
);
