begin;
select plan(7);

select ok(
  (select relrowsecurity from pg_class where oid='public.study_groups'::regclass),
  'study_groups has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.study_group_members'::regclass),
  'study_group_members has RLS enabled'
);
select ok(
  has_table_privilege('authenticated','public.study_groups','select')
  and has_table_privilege('authenticated','public.study_group_members','select'),
  'authenticated users may read group data through RLS'
);
select ok(
  not has_table_privilege('anon','public.study_groups','select')
  and not has_table_privilege('anon','public.study_group_members','select'),
  'anonymous users cannot enumerate groups or memberships'
);
select ok(
  not has_table_privilege('authenticated','public.study_groups','insert')
  and not has_table_privilege('authenticated','public.study_groups','update')
  and not has_table_privilege('authenticated','public.study_groups','delete')
  and not has_table_privilege('authenticated','public.study_group_members','insert')
  and not has_table_privilege('authenticated','public.study_group_members','update')
  and not has_table_privilege('authenticated','public.study_group_members','delete'),
  'clients cannot mutate group data directly'
);
select ok(
  exists(select 1 from pg_policies where schemaname='public' and tablename='study_groups' and policyname='members read own study groups' and cmd='SELECT')
  and exists(select 1 from pg_policies where schemaname='public' and tablename='study_group_members' and policyname='members read members of own groups' and cmd='SELECT'),
  'member-only read policies exist'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename in ('study_groups','study_group_members')),
  2,
  'group tables have no broader legacy policies'
);

select * from finish();
rollback;
