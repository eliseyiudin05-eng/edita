create or replace function private.kivronix_touch_private_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  touched_conversation uuid;
begin
  update public.private_conversations
  set last_message_at = greatest(last_message_at, new.created_at)
  where id = new.conversation_id
    and status = 'active'
    and (editor_id = new.sender_id or business_owner_id = new.sender_id)
  returning id into touched_conversation;

  if touched_conversation is null then
    raise exception using
      errcode = 'P0001',
      message = 'PRIVATE_CHAT_BOUNDARY_VIOLATION';
  end if;

  return new;
end;
$function$;

revoke all on function private.kivronix_touch_private_conversation()
  from public, anon, authenticated;

drop trigger if exists private_message_updates_conversation_order
  on public.private_messages;

create trigger private_message_updates_conversation_order
after insert on public.private_messages
for each row
execute function private.kivronix_touch_private_conversation();
