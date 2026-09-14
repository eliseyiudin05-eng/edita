alter table public.point_topups
  add column if not exists confirmation_url text;

alter table public.point_topups
  drop constraint if exists point_topups_confirmation_url_check;

alter table public.point_topups
  add constraint point_topups_confirmation_url_check
  check (confirmation_url is null or (char_length(confirmation_url) between 12 and 2048 and confirmation_url like 'https://%'));

create index if not exists point_topups_user_created_idx
  on public.point_topups(user_id,created_at desc,id);
