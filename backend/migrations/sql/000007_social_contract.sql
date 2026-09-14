alter table public.study_groups
  add column if not exists age_scope text not null default '18+',
  add column if not exists join_code text,
  add column if not exists max_members integer;

update public.study_groups
set join_code = coalesce(join_code, upper(substr(encode(gen_random_bytes(8),'hex'),1,12))),
    max_members = coalesce(max_members, least(member_limit,100));

alter table public.study_groups
  alter column join_code set not null,
  alter column max_members set not null;

alter table public.study_groups
  add constraint study_groups_age_scope_check check (age_scope in ('under14','14-17','18+')) not valid,
  add constraint study_groups_join_code_length check (char_length(join_code) between 4 and 32) not valid,
  add constraint study_groups_max_members_check check (max_members between 1 and 100) not valid;

alter table public.study_groups validate constraint study_groups_age_scope_check;
alter table public.study_groups validate constraint study_groups_join_code_length;
alter table public.study_groups validate constraint study_groups_max_members_check;
create unique index if not exists study_groups_join_code_uidx on public.study_groups(join_code);
