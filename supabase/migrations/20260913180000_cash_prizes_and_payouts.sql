create table if not exists public.challenge_cash_reward_events(
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.challenge_submissions(id) on delete cascade,
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>0),
  created_at timestamptz not null default now()
);
alter table public.challenge_cash_reward_events enable row level security;
revoke all on table public.challenge_cash_reward_events from public,anon,authenticated;
grant all on table public.challenge_cash_reward_events to service_role;

create table if not exists public.learning_cash_reward_events(
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.learning_competition_entries(id) on delete cascade,
  competition_id uuid not null references public.learning_competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>0),
  created_at timestamptz not null default now()
);
alter table public.learning_cash_reward_events enable row level security;
revoke all on table public.learning_cash_reward_events from public,anon,authenticated;
grant all on table public.learning_cash_reward_events to service_role;

create table if not exists public.payout_requests(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>=10000),
  status text not null default 'pending' check(status in ('pending','approved','paid','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payout_requests_user_created_idx on public.payout_requests(user_id,created_at desc);
create unique index if not exists payout_requests_one_pending_idx on public.payout_requests(user_id) where status in ('pending','approved');
alter table public.payout_requests enable row level security;
revoke all on table public.payout_requests from public,anon,authenticated;
grant all on table public.payout_requests to service_role;

create or replace function private.award_challenge_cash()
returns trigger language plpgsql security definer set search_path='' as $$
declare reward bigint; inserted_count integer;
begin
  if new.status='winner' and (tg_op='INSERT' or old.status is distinct from 'winner') then
    select prize_cents into reward from public.challenges where id=new.challenge_id;
    if coalesce(reward,0)>0 then
      insert into public.challenge_cash_reward_events(submission_id,challenge_id,user_id,amount_cents)
      values(new.id,new.challenge_id,new.editor_id,reward) on conflict(challenge_id) do nothing;
      get diagnostics inserted_count=row_count;
      if inserted_count=1 then update public.profiles set earnings_cents=earnings_cents+reward where id=new.editor_id; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists award_challenge_cash_after_win on public.challenge_submissions;
create trigger award_challenge_cash_after_win after insert or update of status on public.challenge_submissions
for each row execute function private.award_challenge_cash();

create or replace function private.award_learning_competition_cash()
returns trigger language plpgsql security definer set search_path='' as $$
declare inserted_count integer;
begin
  if new.status='winner' and new.prize_cents>0
     and (tg_op='INSERT' or old.status is distinct from 'winner' or old.prize_cents is distinct from new.prize_cents) then
    insert into public.learning_cash_reward_events(entry_id,competition_id,user_id,amount_cents)
    values(new.id,new.competition_id,new.user_id,new.prize_cents) on conflict(entry_id) do nothing;
    get diagnostics inserted_count=row_count;
    if inserted_count=1 then update public.profiles set earnings_cents=earnings_cents+new.prize_cents where id=new.user_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists award_learning_competition_cash_after_win on public.learning_competition_entries;
create trigger award_learning_competition_cash_after_win after insert or update of status,prize_cents on public.learning_competition_entries
for each row execute function private.award_learning_competition_cash();

create or replace function public.create_payout_request(p_user_id uuid,p_amount_cents bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare available bigint; pending bigint; request_id uuid;
begin
  if p_amount_cents<10000 then raise exception 'MINIMUM_PAYOUT'; end if;
  select earnings_cents into available from public.profiles where id=p_user_id for update;
  select coalesce(sum(amount_cents),0) into pending from public.payout_requests where user_id=p_user_id and status in ('pending','approved');
  if pending>0 then raise exception 'PENDING_EXISTS'; end if;
  if coalesce(available,0)<p_amount_cents then raise exception 'NOT_ENOUGH_BALANCE'; end if;
  insert into public.payout_requests(user_id,amount_cents) values(p_user_id,p_amount_cents) returning id into request_id;
  return request_id;
end $$;
revoke all on function public.create_payout_request(uuid,bigint) from public,anon,authenticated;
grant execute on function public.create_payout_request(uuid,bigint) to service_role;
