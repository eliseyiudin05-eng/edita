begin;
select plan(5);

select ok(
  (select relrowsecurity from pg_class where oid='public.friendships'::regclass),
  'friendships has RLS enabled'
);
select ok(
  has_table_privilege('authenticated','public.friendships','select'),
  'authenticated users may read friendships through RLS'
);
select ok(
  not has_table_privilege('anon','public.friendships','select')
  and not has_table_privilege('authenticated','public.friendships','insert')
  and not has_table_privilege('authenticated','public.friendships','update')
  and not has_table_privilege('authenticated','public.friendships','delete'),
  'clients cannot enumerate anonymously or mutate friendships directly'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='friendships'
      and policyname='participants read own friendships'
      and cmd='SELECT' and roles @> array['authenticated']::name[]
  ),
  'participant-only read policy exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='friendships'),
  1,
  'friendships has no broader legacy policies'
);

select * from finish();
rollback;
