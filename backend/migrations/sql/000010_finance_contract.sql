create index if not exists payout_requests_user_created_idx
  on public.payout_requests(user_id,created_at desc,id);

create unique index if not exists payout_requests_one_active_idx
  on public.payout_requests(user_id)
  where status in ('pending','approved');
