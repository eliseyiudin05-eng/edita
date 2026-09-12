create or replace function private.edita_message_has_contact_info(message text)
returns boolean
language sql
immutable
strict
set search_path=''
as $function$
  select
    message ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    or message ~* '[+]?([0-9][[:space:]().-]*){7,}'
    or message ~* '(https?://|www[.]|t[.]me|wa[.]me|vk[.]com|discord[.]gg)'
    or message ~* '(^|[^[:alnum:]_])@[[:alnum:]_.-]{3,}'
    or message ~* '(telegram|телеграм|телега|whats[[:space:]]*app|whatsapp|ватсап|вацап|viber|вайбер|discord|дискорд|instagram|инстаграм|insta|вконтакте|direct)'
    or message ~* '(ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)([[:space:],.;:-]+(ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)){5,}'
    or message ~* '(мой[[:space:]]+номер|номер[[:space:]]+телефона|моя[[:space:]]+почта|мой[[:space:]]+email|мои[[:space:]]+контакты|пиши[[:space:]]+в[[:space:]]+личку|напиши[[:space:]]+в[[:space:]]+личку|мой[[:space:]]+адрес)';
$function$;

revoke all on function private.edita_message_has_contact_info(text) from public,anon,authenticated;
grant execute on function private.edita_message_has_contact_info(text) to service_role;
