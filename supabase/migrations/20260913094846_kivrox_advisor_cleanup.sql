-- Keep server-only tables explicit and avoid per-row auth function re-evaluation.
drop policy if exists "own future plan interest readable" on public.future_plan_interest;
drop policy if exists "own future plan interest insertable" on public.future_plan_interest;
drop policy if exists "own future plan interest updateable" on public.future_plan_interest;
create policy "own future plan interest readable" on public.future_plan_interest for select to authenticated using((select auth.uid())=user_id);
create policy "own future plan interest insertable" on public.future_plan_interest for insert to authenticated with check((select auth.uid())=user_id);
create policy "own future plan interest updateable" on public.future_plan_interest for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

drop policy if exists "own ai feedback readable" on public.ai_feedback;
drop policy if exists "own ai feedback insertable" on public.ai_feedback;
drop policy if exists "own ai feedback updateable" on public.ai_feedback;
create policy "own ai feedback readable" on public.ai_feedback for select to authenticated using((select auth.uid())=user_id);
create policy "own ai feedback insertable" on public.ai_feedback for insert to authenticated with check((select auth.uid())=user_id);
create policy "own ai feedback updateable" on public.ai_feedback for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
