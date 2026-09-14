create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  scope_key text not null check(char_length(scope_key) between 1 and 100),
  title text not null default 'AI Помощник' check(char_length(title) between 1 and 120), lesson_slug text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,scope_key)
);
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('user','assistant','system')), content text not null check(char_length(content) between 1 and 12000),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  message_id uuid references public.ai_messages(id) on delete set null,
  rating integer not null check(rating in (-1,1)), reason text, created_at timestamptz not null default now()
);
create table if not exists public.ai_knowledge_candidates (
  id uuid primary key default gen_random_uuid(), source_kind text not null, source_id uuid,
  content text not null, metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.ai_knowledge (
  id uuid primary key default gen_random_uuid(), content text not null, metadata jsonb not null default '{}'::jsonb,
  source_candidate_id uuid unique references public.ai_knowledge_candidates(id), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.future_plan_interest (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  audience text not null check(audience in ('editor','business')),
  wanted_plan text not null check(wanted_plan in ('creator_plus','studio_plus')),
  joined_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.editor_verification_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  requested_level text not null, status text not null default 'pending', payload jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.guardian_verification_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  guardian_name text not null, guardian_email citext not null, consent_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', reviewer_id uuid references public.profiles(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.business_verification_requests (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending', payload jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.profiles(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.discussion_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(), status text not null default 'active'
);
create table if not exists public.discussion_messages (
  id uuid primary key default gen_random_uuid(), author_id uuid references public.profiles(id) on delete set null,
  content text not null check(char_length(content) between 1 and 1400),
  status text not null default 'published' check(status in ('published','removed')),
  created_at timestamptz not null default now()
);
create table if not exists public.business_discussion_messages (
  id uuid primary key default gen_random_uuid(), topic_key text not null, author_id uuid references public.profiles(id) on delete set null,
  content text not null check(char_length(content) between 1 and 1400),
  status text not null default 'published' check(status in ('published','removed')),
  created_at timestamptz not null default now()
);
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(), author_id uuid references public.profiles(id) on delete set null,
  body text not null, status text not null default 'pending', created_at timestamptz not null default now()
);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id) on delete set null,
  action text not null, subject_type text, subject_id text, request_id text,
  before_data jsonb, after_data jsonb, ip_address inet, created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id,created_at,id);
create index if not exists ai_feedback_user_created_idx on public.ai_feedback(user_id,created_at desc);
create index if not exists ai_knowledge_active_created_idx on public.ai_knowledge(created_at desc) where active;
create index if not exists editor_verification_user_created_idx on public.editor_verification_requests(user_id,created_at desc);
create index if not exists guardian_verification_user_created_idx on public.guardian_verification_requests(user_id,created_at desc);
create index if not exists business_verification_owner_created_idx on public.business_verification_requests(owner_id,created_at desc);
create index if not exists discussion_messages_created_idx on public.discussion_messages(created_at desc,id);
create index if not exists business_discussion_topic_created_idx on public.business_discussion_messages(topic_key,created_at desc,id);
create index if not exists audit_events_actor_created_idx on public.audit_events(actor_id,created_at desc);
