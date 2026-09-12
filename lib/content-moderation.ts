type ModerationResult={allowed:boolean;reason?:"abuse"|"off_topic"|"personal_info";message?:string};

const abusivePattern=/(?:^|[^\p{L}\p{N}])(?:бл(?:я|ять|ядь)|сук(?:а|и|у|ой)?|х(?:у[йеяи]|ер)|пизд[\p{L}]*|(?:е|ё)б(?:ать|ан|уч|ло|нут)[\p{L}]*|fuck\w*|shit\w*|bitch\w*)(?=$|[^\p{L}\p{N}])/iu;
const emailPattern=/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const phonePattern=/(?:\+?\d[\s().-]*){10,}/;
const editingTopicPattern=/(монтаж|видео|ролик|reels?|shorts?|tiktok|youtube|capcut|premiere|davinci|final cut|inshot|\bvn\b|canva|таймлайн|кадр|склейк|субтитр|звук|музык|эффект|переход|экспорт|съ[её]м|сценар|контент|портфолио|клиент|задани|урок|проект|групп)/iu;
const obviousOffTopicPattern=/(казино|ставк[аи]|букмекер|политик|выборы|президент|знакомств|встречаться|майнкрафт|minecraft|fortnite|ставьте деньги|продам аккаунт)/iu;

export async function moderateGroupMessage(raw:string):Promise<ModerationResult>{
  const text=raw.trim();
  if(abusivePattern.test(text))return {allowed:false,reason:"abuse",message:"Система остановила сообщение с оскорблением или грубой бранью."};
  if(emailPattern.test(text)||phonePattern.test(text))return {allowed:false,reason:"personal_info",message:"Телефон и email оставьте за пределами группы. Общайтесь внутри EDITA."};
  if(obviousOffTopicPattern.test(text)&&!editingTopicPattern.test(text))return {allowed:false,reason:"off_topic",message:"Это учебный чат про видео и совместные проекты. Переформулируй сообщение по теме монтажа."};
  if(!process.env.OPENAI_API_KEY)return {allowed:true};

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:"Ты классификатор сообщений закрытой учебной группы по видеомонтажу для аудитории 14+. Ответь только одним токеном: ALLOW, OFF_TOPIC, ABUSE или PERSONAL_INFO. Разрешай монтаж, съёмку, контент, обучение, портфолио, клиентов, совместный проект, дружелюбное приветствие и поддержку. OFF_TOPIC — явный уход в постороннюю тему. ABUSE — мат, травля, унижение, сексуальные домогательства или угрозы. PERSONAL_INFO — просьба или попытка передать телефон, email, адрес либо встретиться вне платформы.",
        input:text.slice(0,1400),
        max_output_tokens:20
      }),
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return {allowed:true};
    const data=await response.json();
    const label=String(data.output_text||"").trim().toUpperCase();
    if(label.includes("ABUSE"))return {allowed:false,reason:"abuse",message:"Система остановила сообщение. Общайтесь спокойно и уважительно."};
    if(label.includes("PERSONAL_INFO"))return {allowed:false,reason:"personal_info",message:"Система остановила личные контакты. Продолжайте разговор внутри учебной группы."};
    if(label.includes("OFF_TOPIC"))return {allowed:false,reason:"off_topic",message:"Это учебный чат про видео и совместные проекты. Переформулируй сообщение по теме монтажа."};
    return {allowed:true};
  }catch{
    return {allowed:true};
  }
}

export async function createGroupAiReply(question:string,recent:string[]){
  if(!process.env.OPENAI_API_KEY)return "Я рядом. Напишите, в какой программе вы работаете и на каком шаге остановились — подскажу короткий путь.";
  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:"Ты помощник EDITA в безопасной учебной группе по видеомонтажу для людей 14+. Отвечай по монтажу, съёмке, роликам, своим работам и совместным проектам. Сохраняй общение внутри платформы. Дай прямой ответ, 2–5 коротких шагов и один способ проверить результат. Поддерживай новичка. Говори о доходе и просмотрах только как о возможных результатах. Сохраняй личные данные в тайне. Используй спокойные утвердительные фразы.",
        input:"Недавний контекст группы:\n"+recent.slice(-8).join("\n")+"\n\nВопрос к помощнику EDITA:\n"+question.slice(0,1400),
        max_output_tokens:700
      }),
      signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw new Error("upstream");
    const data=await response.json();
    return String(data.output_text||"").trim()||"Ответ пока пуст. Попробуйте спросить ещё раз чуть позже.";
  }catch{
    return "Подробный ответ сейчас задерживается. Напишите программу, устройство и точный шаг — вернёмся к вопросу чуть позже.";
  }
}
