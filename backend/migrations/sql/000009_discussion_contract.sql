alter table public.discussion_members
  add column if not exists topic_key text not null default 'editors-in-cinema';

alter table public.discussion_messages
  add column if not exists topic_key text not null default 'editors-in-cinema';

create unique index if not exists discussion_members_topic_user_uidx
  on public.discussion_members(topic_key,user_id);
create index if not exists discussion_messages_topic_created_idx
  on public.discussion_messages(topic_key,created_at desc,id);
