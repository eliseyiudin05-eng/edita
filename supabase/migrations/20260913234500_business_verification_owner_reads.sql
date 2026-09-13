do $$
begin
  if to_regclass('public.business_verification_requests') is not null then
    execute 'alter table public.business_verification_requests enable row level security';
    execute 'revoke all on table public.business_verification_requests from anon, authenticated';
    execute 'grant select on table public.business_verification_requests to authenticated';
    execute 'drop policy if exists "business owner reads verification requests" on public.business_verification_requests';
    execute 'create policy "business owner reads verification requests"
      on public.business_verification_requests for select to authenticated
      using (exists (
        select 1 from public.businesses business
        where business.id = business_verification_requests.business_id
          and business.owner_id = (select auth.uid())
      ))';
  end if;
end
$$;
