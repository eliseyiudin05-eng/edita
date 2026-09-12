create index if not exists private_conversations_business_idx
  on public.private_conversations(business_id);

create index if not exists private_messages_sender_idx
  on public.private_messages(sender_id);
