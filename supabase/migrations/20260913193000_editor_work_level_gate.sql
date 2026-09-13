create or replace function public.enforce_editor_work_level()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id=new.editor_id;
  if p.role is distinct from 'editor'::public.user_role or p.level < 2 or p.xp < 300 then
    raise exception 'EDITOR_LEVEL_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists job_application_level_gate on public.job_applications;
create trigger job_application_level_gate before insert or update on public.job_applications
for each row execute function public.enforce_editor_work_level();

drop trigger if exists challenge_submission_level_gate on public.challenge_submissions;
create trigger challenge_submission_level_gate before insert or update on public.challenge_submissions
for each row execute function public.enforce_editor_work_level();

revoke all on function public.enforce_editor_work_level() from public,anon,authenticated;
