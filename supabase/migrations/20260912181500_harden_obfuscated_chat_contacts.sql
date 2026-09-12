create or replace function private.edita_message_has_contact_info(message text)
returns boolean
language sql
immutable
strict
set search_path=''
as $function$
  select
    regexp_replace(message, '[​-‍⁠﻿]', '', 'g')
      ~* '[[:alnum:]_.%+-]+[[:space:]]*(@|[(]at[)]|[[]at[]]|собака)[[:space:]]*[[:alnum:].-]+[[:space:]]*([.]|точка)[[:space:]]*[[:alpha:]]{2,}'
    or regexp_replace(message, '[​-‍⁠﻿]', '', 'g')
      ~* '(^|[^[:digit:]])([+]?[-[:space:]().]*[[:digit:]]){10,15}($|[^[:digit:]])'
    or regexp_replace(message, '[​-‍⁠﻿]', '', 'g')
      ~* '(телефон|номер|позвон|звонок|для[[:space:]]+связи)[^[:digit:]]{0,24}([[:digit:]][[:space:]().-]*){6,15}'
    or message ~* '(https?://|www[.]|t[.]me|wa[.]me|vk[.]com|discord[.]gg)'
    or message ~* '(^|[^[:alnum:]_-])[[:alnum:]_-]+[.](ru|com|net|org|me|рф|io|co|app|gg|tv|cc|ly|ai)($|[^[:alnum:]_-])'
    or message ~* '(^|[^[:alnum:]_-])[[:alnum:]_-]+[[:space:]]*([.]|точка)[[:space:]]*(ru|com|net|org|me|рф|io|co|app|gg|tv|cc|ly|ai)($|[^[:alnum:]_-])'
    or message ~* '(^|[^[:alnum:]_])@[[:alnum:]_.-]{3,}'
    or message ~* '(telegram|телег(рам[[:alpha:]]*|а|е|у|ой)|whats[[:space:]]*app|whatsapp|ватсап[[:alpha:]]*|вацап[[:alpha:]]*|viber|вайбер[[:alpha:]]*|discord|дискорд[[:alpha:]]*|instagram|инстаграм[[:alpha:]]*|insta|вконтакте|direct)'
    or message ~* '(ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)([[:space:],.;:-]+(ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)){5,}'
    or message ~* '(мой[[:space:]]+номер|номер[[:space:]]+телефона|моя[[:space:]]+почта|мой[[:space:]]+email|мои[[:space:]]+контакты|для[[:space:]]+связи|пиши[[:space:]]+в[[:space:]]+личку|напиши[[:space:]]+в[[:space:]]+личку|мой[[:space:]]+адрес|домашний[[:space:]]+адрес|живу[[:space:]]+(на|по|в)|встретимся[[:space:]]+(на|по|в))';
$function$;

revoke all on function private.edita_message_has_contact_info(text) from public,anon,authenticated;
grant execute on function private.edita_message_has_contact_info(text) to service_role;
