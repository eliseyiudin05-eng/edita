create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create index if not exists friendships_requester_created_idx
  on public.friendships(requester_id,created_at desc);
create index if not exists friendships_addressee_created_idx
  on public.friendships(addressee_id,created_at desc);

alter table public.friendships enable row level security;

do $$
declare existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname='public' and tablename='friendships'
  loop
    execute format('drop policy %I on public.friendships',existing_policy.policyname);
  end loop;
end $$;

revoke all on table public.friendships from anon,authenticated;
grant select on table public.friendships to authenticated;

create policy "participants read own friendships"
  on public.friendships
  for select
  to authenticated
  using ((select auth.uid())=requester_id or (select auth.uid())=addressee_id);

