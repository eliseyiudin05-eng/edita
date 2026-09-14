create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, brand_context jsonb not null default '{}'::jsonb, verified boolean not null default false,
  verification_level text not null default 'unverified', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(owner_id), check (char_length(name) between 1 and 160)
);
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(), business_id uuid references public.businesses(id) on delete cascade,
  title text not null, brief text not null, status text not null default 'draft', prize_cents bigint not null default 0,
  prize_points integer not null default 0 check (prize_points between 0 and 100000000), custom_prize text,
  ends_at timestamptz, source_assets jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(),
  check (custom_prize is null or char_length(custom_prize)<=500)
);
create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(), challenge_id uuid not null references public.challenges(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade, video_url text not null,
  ai_score integer check (ai_score between 0 and 100), ai_feedback jsonb not null default '{}'::jsonb,
  status text not null default 'submitted', created_at timestamptz not null default now(), unique(challenge_id,editor_id)
);
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(), editor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, video_url text not null, tags text[] not null default '{}',
  ai_score integer check (ai_score between 0 and 100), created_at timestamptz not null default now()
);
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null, description text not null, budget_min_cents bigint, budget_max_cents bigint,
  payment_points integer not null default 0 check (payment_points between 0 and 10000000),
  status text not null default 'open', created_at timestamptz not null default now()
);
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'applied', created_at timestamptz not null default now(), unique(job_id,editor_id)
);
create table if not exists public.business_campaigns (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null, description text not null default '', budget_cents bigint not null default 0,
  status text not null default 'open', created_at timestamptz not null default now()
);
create table if not exists public.business_campaign_applications (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.business_campaigns(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'applied', created_at timestamptz not null default now(), unique(campaign_id,editor_id)
);
create table if not exists public.business_reviews (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade, rating integer not null check (rating between 1 and 5),
  comment text, created_at timestamptz not null default now(), unique(business_id,reviewer_id)
);
create table if not exists public.business_saved_editors (
  business_id uuid not null references public.businesses(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(business_id,editor_id)
);
create table if not exists public.creator_briefs (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '',
  reward_text text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.creator_program_applications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending', payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id)
);
create table if not exists public.creator_brief_interest (
  brief_id uuid not null references public.creator_briefs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(brief_id,user_id)
);
create table if not exists public.private_conversations (
  id uuid primary key default gen_random_uuid(), editor_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  business_owner_id uuid not null references public.profiles(id) on delete cascade,
  source_kind text not null check (source_kind in ('campaign','challenge','job','kivronix_contest','edita_contest')),
  source_id uuid not null, company_name text not null check (char_length(company_name) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180), status text not null default 'active' check (status in ('active','closed')),
  last_message_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(source_kind,source_id,editor_id)
);
create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1500), created_at timestamptz not null default now()
);
create table if not exists public.work_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  available_points bigint not null default 0 check (available_points>=0),
  reserved_points bigint not null default 0 check (reserved_points>=0), updated_at timestamptz not null default now()
);
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.profiles(id), editor_id uuid not null references public.profiles(id),
  conversation_id uuid unique references public.private_conversations(id), gross_points integer not null check (gross_points>0),
  platform_fee_points integer not null default 0 check (platform_fee_points>=0), editor_points integer not null check (editor_points>0),
  status text not null default 'funded' check (status in ('funded','submitted','completed','disputed','cancelled')),
  submitted_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.work_order_deliverables (
  work_order_id uuid primary key references public.work_orders(id) on delete cascade,
  preview_path text not null, original_path text not null, preview_name text not null, original_name text not null,
  submitted_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (preview_path<>original_path), check (char_length(preview_name) between 1 and 160),
  check (char_length(original_name) between 1 and 160)
);
create table if not exists public.point_topups (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  points integer not null check(points between 100 and 1000000), amount_cents bigint not null,
  provider text not null default 'yookassa', provider_payment_id text unique,
  status text not null default 'pending' check(status in ('pending','succeeded','cancelled')),
  created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.work_point_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  work_order_id uuid references public.work_orders(id), topup_id uuid references public.point_topups(id),
  kind text not null check(kind in ('topup','reserve','release','earning','fee','refund')),
  points bigint not null, created_at timestamptz not null default now()
);
create table if not exists public.payments (
  id text primary key, user_id uuid references public.profiles(id) on delete set null, product text not null,
  amount_cents bigint not null default 0, currency text not null default 'RUB', status text not null,
  provider text not null default 'yookassa', provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  product text not null, source_payment_id text unique not null references public.payments(id) on delete cascade,
  starts_at timestamptz not null default now(), expires_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents bigint not null check(amount_cents>=10000), status text not null default 'pending' check(status in ('pending','approved','paid','rejected')),
  payout_details jsonb not null default '{}'::jsonb, reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz, created_at timestamptz not null default now()
);

create index if not exists businesses_owner_idx on public.businesses(owner_id);
create index if not exists challenges_business_status_idx on public.challenges(business_id,status,created_at desc);
create index if not exists challenge_submissions_editor_idx on public.challenge_submissions(editor_id,created_at desc);
create index if not exists jobs_business_status_idx on public.jobs(business_id,status,created_at desc);
create index if not exists job_applications_editor_idx on public.job_applications(editor_id,created_at desc);
create index if not exists private_conversations_editor_recent_idx on public.private_conversations(editor_id,last_message_at desc);
create index if not exists private_conversations_owner_recent_idx on public.private_conversations(business_owner_id,last_message_at desc);
create index if not exists private_messages_conversation_recent_idx on public.private_messages(conversation_id,created_at,id);
create unique index if not exists work_point_events_one_topup_idx on public.work_point_events(topup_id) where topup_id is not null and kind='topup';

create or replace view public.public_businesses with (security_invoker=true) as
select id,name,verified,verification_level from public.businesses;
