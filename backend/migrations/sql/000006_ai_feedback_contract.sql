alter table public.ai_feedback
  add column if not exists helpful boolean,
  add column if not exists comment text;

update public.ai_feedback
set helpful = (rating = 1),
    comment = coalesce(comment, reason)
where helpful is null;

alter table public.ai_feedback
  alter column helpful set not null;

create unique index if not exists ai_feedback_user_message_uidx
  on public.ai_feedback(user_id,message_id)
  where message_id is not null;

alter table public.ai_feedback
  add constraint ai_feedback_comment_length check (comment is null or char_length(comment) < 20) not valid;

alter table public.ai_feedback validate constraint ai_feedback_comment_length;

alter table public.profiles drop constraint if exists profiles_avatar_url_length;
alter table public.profiles
  add constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 4096) not valid;
alter table public.profiles validate constraint profiles_avatar_url_length;
