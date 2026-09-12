drop policy if exists "public profiles readable" on public.public_profiles;

create index if not exists beta_members_program_id_idx
  on public.beta_members(program_id);

create index if not exists beta_members_access_code_id_idx
  on public.beta_members(access_code_id);
