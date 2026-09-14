begin;
select plan(6);

select ok(
  (select relrowsecurity from pg_class where oid='public.private_messages'::regclass),
  'private message RLS is enabled'
);
select ok(
  has_column_privilege('authenticated','public.private_messages','id','insert')
  and has_column_privilege('authenticated','public.private_messages','conversation_id','insert')
  and has_column_privilege('authenticated','public.private_messages','sender_id','insert')
  and has_column_privilege('authenticated','public.private_messages','body','insert'),
  'private message write columns are granted'
);
select ok(
  not has_column_privilege('authenticated','public.private_messages','created_at','insert')
  and not has_table_privilege('authenticated','public.private_messages','update')
  and not has_table_privilege('authenticated','public.private_messages','delete'),
  'timestamps, updates and deletes remain unavailable'
);
select is(
  (select count(*)::integer from pg_policies where schemaname='public' and tablename='private_messages' and cmd='INSERT' and policyname like 'chat participant%'),
  2,
  'private message inserts have permissive and restrictive participant boundaries'
);
select ok(
  has_function_privilege('authenticated','private.kivronix_message_has_contact_info(text)','execute'),
  'the contact guard can run during inserts'
);
select ok(
  not has_schema_privilege('authenticated','private','usage'),
  'the private helper schema remains hidden'
);

select * from finish();
rollback;
