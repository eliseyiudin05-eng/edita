alter table public.private_conversations
  drop constraint if exists private_conversations_source_kind_check;
alter table public.private_conversations
  add constraint private_conversations_source_kind_check
  check (source_kind in ('campaign','challenge','job','kivronix_contest','direct'));

create table if not exists public.editor_reviews(
  id uuid primary key default gen_random_uuid(),
  editor_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  rating smallint not null check(rating between 1 and 5),
  comment text not null check(char_length(comment) between 10 and 800),
  moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','rejected')),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(editor_id,reviewer_id,conversation_id)
);

alter table public.editor_reviews enable row level security;
create policy "approved editor reviews readable" on public.editor_reviews
for select to anon,authenticated using(moderation_status='approved' or reviewer_id=(select auth.uid()) or editor_id=(select auth.uid()));
grant select on public.editor_reviews to anon,authenticated;
grant all on public.editor_reviews to service_role;
create index if not exists editor_reviews_public_rating_idx on public.editor_reviews(editor_id,rating) where moderation_status='approved';
create index if not exists editor_reviews_moderation_idx on public.editor_reviews(moderation_status,created_at);
create index if not exists editor_reviews_reviewer_idx on public.editor_reviews(reviewer_id);
create index if not exists editor_reviews_conversation_idx on public.editor_reviews(conversation_id);
