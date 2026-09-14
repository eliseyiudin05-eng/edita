-- v2.0.0-alpha.13: harden jobs, applications and Points reservation for the Go API.

alter table public.jobs
  add constraint jobs_title_contract check (char_length(btrim(title)) between 3 and 120) not valid,
  add constraint jobs_description_contract check (char_length(btrim(description)) between 10 and 3000) not valid,
  add constraint jobs_status_contract check (status in ('open','closed','cancelled')) not valid;

alter table public.job_applications
  add constraint job_applications_status_contract
  check (status in ('applied','shortlisted','accepted','declined')) not valid;

create index if not exists jobs_open_created_idx
  on public.jobs(created_at desc,id)
  where status='open';

create index if not exists job_applications_job_created_idx
  on public.job_applications(job_id,created_at desc,editor_id);

create index if not exists work_point_events_work_order_kind_idx
  on public.work_point_events(work_order_id,kind,created_at)
  where work_order_id is not null;

revoke all on public.jobs,public.job_applications,public.work_wallets,
  public.work_orders,public.work_point_events from public;
