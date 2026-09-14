begin;
select plan(9);

select ok(
  (select relrowsecurity from pg_class where oid='public.discussion_members'::regclass),
  'discussion_members has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.discussion_messages'::regclass),
  'discussion_messages has RLS enabled'
);
select ok(
  not has_table_privilege('anon','public.discussion_members','select')
  and not has_table_privilege('anon','public.discussion_messages','select'),
  'anonymous users cannot enumerate discussion membership or messages'
);
select ok(
  has_table_privilege('authenticated','public.discussion_members','select')
  and has_table_privilege('authenticated','public.discussion_messages','select'),
  'authenticated users may read the bounded discussion through RLS'
);
select ok(
  not has_table_privilege('authenticated','public.discussion_members','insert')
  and not has_table_privilege('authenticated','public.discussion_members','update')
  and not has_table_privilege('authenticated','public.discussion_members','delete')
  and not has_table_privilege('authenticated','public.discussion_messages','insert')
  and not has_table_privilege('authenticated','public.discussion_messages','update')
  and not has_table_privilege('authenticated','public.discussion_messages','delete'),
  'authenticated clients cannot mutate discussion data directly'
);
select ok(
  has_column_privilege('authenticated','public.discussion_members','topic_key','select')
  and has_column_privilege('authenticated','public.discussion_members','user_id','select')
  and not has_column_privilege('authenticated','public.discussion_members','joined_at','select'),
  'membership reads expose only the two required columns'
);
select ok(
  has_column_privilege('authenticated','public.discussion_messages','id','select')
  and has_column_privilege('authenticated','public.discussion_messages','content','select')
  and not has_column_privilege('authenticated','public.discussion_messages','id','insert'),
  'message access is read-only and column-scoped'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='discussion_members' and cmd='SELECT' and policyname like 'editor discussion%'),
  2,
  'membership has permissive and restrictive owner boundaries'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='discussion_messages' and cmd='SELECT' and policyname like 'editor discussion%'),
  2,
  'messages have permissive and restrictive member boundaries'
);

select * from finish();
rollback;
