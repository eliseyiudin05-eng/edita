alter table public.private_messages enable row level security;

revoke insert, update, delete on table public.private_messages from authenticated;
grant insert (id, conversation_id, sender_id, body)
  on table public.private_messages to authenticated;

-- The stored CHECK constraint calls this immutable predicate by object ID.
-- Keep the private schema hidden while allowing constraint evaluation.
grant execute on function private.kivronix_message_has_contact_info(text)
  to authenticated;

drop policy if exists "chat participants create messages"
  on public.private_messages;
drop policy if exists "chat participant message boundary"
  on public.private_messages;

create policy "chat participants create messages"
  on public.private_messages
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and sender_id = (select auth.uid())
    and exists (
      select 1
      from public.private_conversations conversation
      where conversation.id = private_messages.conversation_id
        and conversation.status = 'active'
        and (
          conversation.editor_id = (select auth.uid())
          or conversation.business_owner_id = (select auth.uid())
        )
    )
  );

create policy "chat participant message boundary"
  on public.private_messages
  as restrictive
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and sender_id = (select auth.uid())
    and exists (
      select 1
      from public.private_conversations conversation
      where conversation.id = private_messages.conversation_id
        and conversation.status = 'active'
        and (
          conversation.editor_id = (select auth.uid())
          or conversation.business_owner_id = (select auth.uid())
        )
    )
  );
