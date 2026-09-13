alter table public.lessons enable row level security;
revoke all on table public.lessons from anon, authenticated;
grant select on table public.lessons to authenticated;

drop policy if exists "published lessons readable" on public.lessons;
create policy "published lessons readable"
on public.lessons for select
to authenticated
using (published = true);

alter table public.lesson_progress enable row level security;
revoke all on table public.lesson_progress from anon, authenticated;
grant select on table public.lesson_progress to authenticated;

drop policy if exists "own progress" on public.lesson_progress;
drop policy if exists "own progress readable" on public.lesson_progress;
create policy "own progress readable"
on public.lesson_progress for select
to authenticated
using ((select auth.uid()) = user_id);
