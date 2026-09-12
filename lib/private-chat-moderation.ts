const emailPattern=/[\p{L}\p{N}._%+-]+\s*(?:@|\(at\)|\[at\]|собака)\s*[\p{L}\p{N}.-]+\s*(?:\.|точка)\s*[a-zа-яё]{2,}/iu;
const phonePattern=/(?:^|[^\p{N}])(?:\+?\p{N}[\s().-]*){10,15}(?:$|[^\p{N}])/u;
const shortPhoneWithCuePattern=/(?:^|[^\p{L}\p{N}_])(?:телефон|номер|позвон|звонок|для\s+связи)\D{0,24}(?:\p{N}[\s().-]*){6,15}/iu;
const linkPattern=/(?:https?:\/\/|www\.|t\.me\/|wa\.me\/|vk\.com\/|discord\.gg\/|(?:^|[^\p{L}\p{N}_])[a-z0-9а-яё-]+\.(?:ru|com|net|org|me|рф|io|co|app|gg|tv|cc|ly|ai)(?=\/|$|[^\p{L}\p{N}_]))/iu;
const spacedDomainPattern=/(?:^|[^\p{L}\p{N}_])[\p{L}\p{N}-]{2,}\s*(?:\.|точка)\s*(?:ru|com|net|org|me|рф|io|co|app|gg|tv|cc|ly|ai)(?=$|[^\p{L}\p{N}_])/iu;
const handlePattern=/(?:^|[^\p{L}\p{N}_])@[\p{L}\p{N}_.-]{3,}/iu;
const messengerPattern=/(?:^|[^\p{L}\p{N}_])(?:telegram|телег(?:рам[а-яё]*|а|е|у|ой)|tg|whats\s*app|whatsapp|ватсап[а-яё]*|вацап[а-яё]*|viber|вайбер[а-яё]*|discord|дискорд[а-яё]*|instagram|инстаграм[а-яё]*|insta|вконтакте|вк|direct)(?=$|[^\p{L}\p{N}_])/iu;
const spelledPhonePattern=/(?:^|[^\p{L}\p{N}_])(?:ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)(?:[\s,.;:-]+(?:ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)){5,}(?=$|[^\p{L}\p{N}_])/iu;
const hiddenContactPattern=/(?:^|[^\p{L}\p{N}_])(?:мой\s+номер|номер\s+телефона|моя\s+почта|мой\s+email|мои\s+контакты|для\s+связи|пиши\s+в\s+личку|напиши\s+в\s+личку|собака\s+[a-zа-яё]|точка\s+(?:ру|ком|com|ru)|мой\s+адрес|домашний\s+адрес|живу\s+(?:на|по|в)|встретимся\s+(?:на|по|в))(?=$|[^\p{L}\p{N}_])/iu;

export type PrivateChatBlockReason="email"|"phone"|"link"|"account"|"messenger"|"hidden_contact";

export function findPrivateChatBlockReason(value:string):PrivateChatBlockReason|null{
  const text=value.normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/gu,"").trim();
  if(emailPattern.test(text))return "email";
  if(phonePattern.test(text))return "phone";
  if(shortPhoneWithCuePattern.test(text))return "phone";
  if(linkPattern.test(text))return "link";
  if(spacedDomainPattern.test(text))return "link";
  if(handlePattern.test(text))return "account";
  if(messengerPattern.test(text))return "messenger";
  if(spelledPhonePattern.test(text))return "phone";
  if(hiddenContactPattern.test(text))return "hidden_contact";
  return null;
}

export function privateChatBlockMessage(){
  return "Контакты и ссылки остаются за пределами чата. Напишите сообщение о работе внутри EDITA.";
}
