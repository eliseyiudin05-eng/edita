create table if not exists public.academy_assessments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_index integer not null check(module_index between 0 and 30),
  module_name text not null,
  score integer not null check(score between 0 and 100),
  quiz_score integer not null check(quiz_score between 0 and 100),
  passed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,module_index)
);

alter table public.academy_assessments enable row level security;
drop policy if exists academy_assessments_read_own on public.academy_assessments;
create policy academy_assessments_read_own on public.academy_assessments for select to authenticated using(auth.uid()=user_id);

alter table public.testimonials add column if not exists reward_awarded boolean not null default false;
alter table public.testimonials add column if not exists display_name text;
alter table public.testimonials add column if not exists role_label text;
alter table public.testimonials add column if not exists text text;
alter table public.testimonials add column if not exists rating integer check(rating between 1 and 5);
alter table public.testimonials add column if not exists approved boolean not null default false;
alter table public.testimonials add column if not exists permission_to_publish boolean not null default false;
create unique index if not exists testimonials_one_per_author_idx on public.testimonials(author_id) where author_id is not null;

alter table public.portfolio_items add column if not exists publication_consent boolean not null default true;
alter table public.portfolio_items add column if not exists source_label text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-videos','portfolio-videos',true,209715200,array['video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists portfolio_videos_insert_own on storage.objects;
create policy portfolio_videos_insert_own on storage.objects for insert to authenticated
with check(bucket_id='portfolio-videos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists portfolio_videos_delete_own on storage.objects;
create policy portfolio_videos_delete_own on storage.objects for delete to authenticated
using(bucket_id='portfolio-videos' and owner_id=auth.uid()::text);
