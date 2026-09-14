-- Supabase default function privileges can grant anon an explicit EXECUTE ACL.
-- The helper is used only by authenticated study-group RLS policies.
revoke all on function public.is_current_user_study_group_member(uuid)
  from public, anon;

grant execute on function public.is_current_user_study_group_member(uuid)
  to authenticated;
