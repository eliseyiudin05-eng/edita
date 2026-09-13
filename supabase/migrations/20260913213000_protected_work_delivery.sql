alter table public.work_orders
  add column if not exists cancelled_at timestamptz;

create table if not exists public.work_order_deliverables(
  work_order_id uuid primary key references public.work_orders(id) on delete cascade,
  preview_path text not null,
  original_path text not null,
  preview_name text not null check(char_length(preview_name) between 1 and 160),
  original_name text not null check(char_length(original_name) between 1 and 160),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_deliverables_distinct_paths check(preview_path<>original_path)
);

alter table public.work_order_deliverables enable row level security;

drop policy if exists "work order participants read deliverables" on public.work_order_deliverables;
create policy "work order participants read deliverables"
on public.work_order_deliverables for select to authenticated
using(exists(
  select 1 from public.work_orders o
  where o.id=work_order_id
    and (o.customer_id=(select auth.uid()) or o.editor_id=(select auth.uid()))
));

grant select on public.work_order_deliverables to authenticated;
grant all on public.work_order_deliverables to service_role;

create or replace function public.submit_work_order(
  p_editor uuid,
  p_order uuid,
  p_preview_path text,
  p_original_path text,
  p_preview_name text,
  p_original_name text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare o public.work_orders%rowtype; expected_prefix text;
begin
  select * into o from public.work_orders where id=p_order and editor_id=p_editor for update;
  if o.id is null or o.status not in ('funded','submitted') then
    raise exception 'ORDER_NOT_SUBMITTABLE';
  end if;

  expected_prefix:=o.conversation_id::text||'/delivery/'||o.id::text;
  if p_preview_path not like expected_prefix||'/preview/'||p_editor::text||'/%'
     or p_original_path not like expected_prefix||'/original/'||p_editor::text||'/%' then
    raise exception 'INVALID_DELIVERY_PATH';
  end if;
  if not exists(select 1 from storage.objects where bucket_id='work-files' and name=p_preview_path)
     or not exists(select 1 from storage.objects where bucket_id='work-files' and name=p_original_path) then
    raise exception 'DELIVERY_FILE_MISSING';
  end if;

  insert into public.work_order_deliverables(work_order_id,preview_path,original_path,preview_name,original_name)
  values(p_order,p_preview_path,p_original_path,left(p_preview_name,160),left(p_original_name,160))
  on conflict(work_order_id) do update set
    preview_path=excluded.preview_path,
    original_path=excluded.original_path,
    preview_name=excluded.preview_name,
    original_name=excluded.original_name,
    submitted_at=now(),
    updated_at=now();

  update public.work_orders set status='submitted',submitted_at=now() where id=o.id;
end $$;

revoke all on function public.submit_work_order(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_work_order(uuid,uuid,text,text,text,text) to service_role;

create or replace function public.complete_work_order(p_customer uuid,p_order uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare o public.work_orders%rowtype;
begin
  select * into o from public.work_orders where id=p_order and customer_id=p_customer for update;
  if o.id is null or o.status<>'submitted' then raise exception 'ORDER_NOT_COMPLETABLE'; end if;
  if not exists(select 1 from public.work_order_deliverables d where d.work_order_id=o.id) then
    raise exception 'DELIVERY_REQUIRED';
  end if;
  insert into public.work_wallets(user_id) values(o.editor_id) on conflict do nothing;
  update public.work_wallets set reserved_points=reserved_points-o.gross_points,updated_at=now() where user_id=o.customer_id;
  update public.work_wallets set available_points=available_points+o.gross_points,updated_at=now() where user_id=o.editor_id;
  update public.work_orders set status='completed',platform_fee_points=0,editor_points=gross_points,completed_at=now() where id=o.id;
  insert into public.work_point_events(user_id,work_order_id,kind,points) values(o.editor_id,o.id,'earning',o.gross_points);
end $$;

revoke all on function public.complete_work_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_work_order(uuid,uuid) to service_role;

create or replace function public.refund_work_order(p_customer uuid,p_order uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare o public.work_orders%rowtype;
begin
  select * into o from public.work_orders where id=p_order and customer_id=p_customer for update;
  if o.id is null or o.status not in ('funded','submitted') then raise exception 'ORDER_NOT_REFUNDABLE'; end if;
  update public.work_wallets
  set reserved_points=reserved_points-o.gross_points,
      available_points=available_points+o.gross_points,
      updated_at=now()
  where user_id=o.customer_id;
  update public.work_orders set status='cancelled',cancelled_at=now() where id=o.id;
  insert into public.work_point_events(user_id,work_order_id,kind,points)
  values(o.customer_id,o.id,'refund',o.gross_points);
end $$;

revoke all on function public.refund_work_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.refund_work_order(uuid,uuid) to service_role;

drop policy if exists "work participants upload" on storage.objects;
drop policy if exists "work participants read" on storage.objects;
drop policy if exists "work scoped uploads" on storage.objects;
drop policy if exists "work scoped reads" on storage.objects;

create policy "work scoped uploads"
on storage.objects for insert to authenticated
with check(
  bucket_id='work-files' and (
    (
      (storage.foldername(name))[2]='attachments'
      and (storage.foldername(name))[3]=(select auth.uid())::text
      and exists(
        select 1 from public.private_conversations c
        where c.id::text=(storage.foldername(name))[1]
          and (c.editor_id=(select auth.uid()) or c.business_owner_id=(select auth.uid()))
      )
    ) or (
      (storage.foldername(name))[2]='delivery'
      and (storage.foldername(name))[4] in ('preview','original')
      and (storage.foldername(name))[5]=(select auth.uid())::text
      and exists(
        select 1 from public.work_orders o
        where o.conversation_id::text=(storage.foldername(name))[1]
          and o.id::text=(storage.foldername(name))[3]
          and o.editor_id=(select auth.uid())
          and o.status in ('funded','submitted')
      )
    )
  )
);

create policy "work scoped reads"
on storage.objects for select to authenticated
using(
  bucket_id='work-files' and (
    (
      (storage.foldername(name))[2]=(select auth.uid())::text
      and exists(
        select 1 from public.private_conversations c
        where c.id::text=(storage.foldername(name))[1]
          and (c.editor_id=(select auth.uid()) or c.business_owner_id=(select auth.uid()))
      )
    ) or (
      (storage.foldername(name))[2]='attachments'
      and exists(
        select 1 from public.private_conversations c
        where c.id::text=(storage.foldername(name))[1]
          and (c.editor_id=(select auth.uid()) or c.business_owner_id=(select auth.uid()))
      )
    ) or (
      exists(
        select 1
        from public.work_orders o
        join public.work_order_deliverables d on d.work_order_id=o.id
        where o.conversation_id::text=(storage.foldername(name))[1]
          and o.id::text=(storage.foldername(name))[3]
          and (
            (d.preview_path=name and o.status in ('submitted','completed')
              and (o.customer_id=(select auth.uid()) or o.editor_id=(select auth.uid())))
            or
            (d.original_path=name
              and (o.editor_id=(select auth.uid()) or (o.customer_id=(select auth.uid()) and o.status='completed')))
          )
      )
    )
  )
);
