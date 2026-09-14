begin;
select plan(7);

select is(
  (select count(*)::integer
   from pg_trigger
   where tgrelid = 'public.private_messages'::regclass
     and tgname = 'private_message_updates_conversation_order'
     and not tgisinternal),
  1,
  'private messages have one ordering trigger'
);
select ok(
  (select prosecdef
   from pg_proc
   where oid = 'private.kivronix_touch_private_conversation()'::regprocedure),
  'ordering trigger has the privileges needed to update conversations'
);
select is(
  (select proconfig
   from pg_proc
   where oid = 'private.kivronix_touch_private_conversation()'::regprocedure),
  array['search_path=']::text[],
  'ordering trigger uses an empty search path'
);
select ok(
  not exists(
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) privilege
    where procedure.oid = 'private.kivronix_touch_private_conversation()'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege('anon','private.kivronix_touch_private_conversation()','execute')
  and not has_function_privilege('authenticated','private.kivronix_touch_private_conversation()','execute'),
  'ordering trigger cannot be called through the Data API'
);
select ok(
  not has_table_privilege('authenticated','public.private_conversations','update')
  and not has_column_privilege('authenticated','public.private_conversations','last_message_at','update'),
  'clients cannot forge conversation ordering timestamps'
);
select matches(
  (select pg_get_functiondef('private.kivronix_touch_private_conversation()'::regprocedure)),
  $$status = 'active'$$,
  'ordering update requires an active conversation'
);
select matches(
  (select pg_get_functiondef('private.kivronix_touch_private_conversation()'::regprocedure)),
  $$editor_id = new.sender_id or business_owner_id = new.sender_id$$,
  'ordering update requires the inserted sender to be a participant'
);

select * from finish();
rollback;
