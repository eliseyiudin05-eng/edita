create table if not exists public.practice_sessions(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scenario text not null default '',
  messages jsonb not null default '[]'::jsonb,
  result jsonb,
  updated_at timestamptz not null default now(),
  constraint practice_scenario_length check(char_length(scenario)<=2000),
  constraint practice_messages_shape check(jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=50),
  constraint practice_result_shape check(result is null or jsonb_typeof(result)='object')
);

alter table public.practice_sessions enable row level security;

drop policy if exists "users read own practice" on public.practice_sessions;
create policy "users read own practice" on public.practice_sessions
for select to authenticated using((select auth.uid())=user_id);

drop policy if exists "users insert own practice" on public.practice_sessions;
create policy "users insert own practice" on public.practice_sessions
for insert to authenticated with check((select auth.uid())=user_id);

drop policy if exists "users update own practice" on public.practice_sessions;
create policy "users update own practice" on public.practice_sessions
for update to authenticated using((select auth.uid())=user_id)
with check((select auth.uid())=user_id);

drop policy if exists "users delete own practice" on public.practice_sessions;
create policy "users delete own practice" on public.practice_sessions
for delete to authenticated using((select auth.uid())=user_id);

grant select,insert,update,delete on public.practice_sessions to authenticated;
create index if not exists practice_sessions_updated_at_idx on public.practice_sessions(updated_at desc);
