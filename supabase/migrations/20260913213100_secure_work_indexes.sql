create index if not exists work_orders_customer_id_idx on public.work_orders(customer_id);
create index if not exists work_orders_editor_id_idx on public.work_orders(editor_id);
create index if not exists point_topups_user_id_idx on public.point_topups(user_id);
create index if not exists work_point_events_user_id_idx on public.work_point_events(user_id);
create index if not exists work_point_events_work_order_id_idx on public.work_point_events(work_order_id);
