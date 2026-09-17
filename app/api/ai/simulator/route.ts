import {NextRequest,NextResponse} from "next/server";
import {getUserFromAccessToken} from "@/lib/server-supabase";

const resultSchema={
  type:"object",
  additionalProperties:false,
  properties:{
    client_reply:{type:"string"},
    score:{type:"integer",minimum:0,maximum:100},
    feedback:{type:"string"},
    coach_hint:{type:"string"},
    deal_status:{type:"string",enum:["ongoing","won","lost"]},
    deal_reason:{type:"string"}
  },
  required:["client_reply","score","feedback","coach_hint","deal_status","deal_reason"]
};

const scenarioSchema={
  type:"object",
  additionalProperties:false,
  properties:{
    id:{type:"string"},
    client_name:{type:"string"},
    client_role:{type:"string"},
    personality:{type:"string"},
    project:{type:"string"},
    budget:{type:"string"},
    deadline:{type:"string"},
    hidden_concern:{type:"string"},
    difficulty:{type:"string",enum:["Базовая","Средняя","Сложная"]},
    opening_message:{type:"string"}
  },
  required:["id","client_name","client_role","personality","project","budget","deadline","hidden_concern","difficulty","opening_message"]
};

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const bearer=req.headers.get("authorization");
    const token=bearer?.startsWith("Bearer ")?bearer.slice(7):null;
    const user=await getUserFromAccessToken(token);

    if(body?.mode==="new_scenario"){
      const recent=Array.isArray(body.recentScenarios)?body.recentScenarios.slice(-8).map(String):[];
      const round=Math.max(0,Math.min(100000,Number(body.round)||0));
      if(!process.env.OPENAI_API_KEY||!user)return NextResponse.json({demo:true,scenario:demoScenario(recent,round)});
      const response=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
        body:JSON.stringify({
          model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
          instructions:`Придумай реалистичного заказчика для тренировки переговоров начинающего или растущего видеомонтажёра. Каждый новый персонаж должен заметно отличаться сферой, манерой общения, бюджетом, сроком, задачей и скрытым сомнением. Используй правдоподобные российские суммы и рабочие ситуации: эксперт, кафе, интернет-магазин, музыкант, блогер, локальный бренд, образовательный проект, агентство. Иногда клиент спешит, иногда сомневается в цене, иногда плохо сформулировал задачу, иногда сравнивает с другим исполнителем. opening_message должно звучать как живое первое сообщение в мессенджере. Не повторяй недавние сценарии. Не раскрывай hidden_concern в opening_message. Пиши по-русски.`,
          input:`Номер тренировки: ${round}. Недавние сценарии, которые нельзя повторять: ${recent.join(" | ")||"нет"}.`,
          max_output_tokens:700,
          text:{format:{type:"json_schema",name:"practice_scenario",strict:true,schema:scenarioSchema}}
        })
      });
      if(!response.ok){console.error("Scenario OpenAI error",response.status,await response.text());return NextResponse.json({demo:true,degraded:true,scenario:demoScenario(recent,round)});}
      const data=await response.json();
      const raw=outputText(data);
      return NextResponse.json({demo:false,scenario:JSON.parse(raw)});
    }

    const {message,history,scenario}=body||{};
    if(!message||typeof message!=="string")return NextResponse.json({error:"message required"},{status:400});
    if(!process.env.OPENAI_API_KEY||!user){
      return NextResponse.json({demo:true,result:demoReply(message,Array.isArray(history)?history:[],scenario),reason:!user?"auth_required_for_live_ai":"openai_not_configured"});
    }

    const conversation=Array.isArray(history)?history.slice(-18).map((item:any)=>({
      role:item.from==="client"?"assistant":"user",
      content:String(item.text||"")
    })):[];
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:`Ты одновременно играешь живого заказчика и работаешь как тренер переговоров KIVRONIX.

Как заказчик:
- строго придерживайся переданного персонажа, бюджета, срока, задачи и скрытого сомнения;
- помни весь разговор и не повторяй уже заданные вопросы;
- реагируй на смысл последнего сообщения, включая неидеальные формулировки и разговорный русский;
- если бюджет, например, 3 000 ₽, жди понятного объяснения, что входит в эту сумму и какую задачу решает работа, а не простой защиты цены;
- торгуйся, сомневайся, соглашайся или отказывайся так, как поступил бы реальный человек;
- сделка считается выигранной только когда клиент явно согласился, а результат, стоимость, срок и границы правок достаточно ясны;
- если монтажёр давит, игнорирует задачу или несколько раз уходит от конкретики, клиент может отказаться.

Как тренер:
- полностью учитывай формулировку ученика, даже если она написана с ошибками;
- score оценивает именно последний ответ в контексте всей беседы;
- feedback называет один конкретный сильный момент и один пробел;
- coach_hint не пишет готовый ответ и не даёт текст для копирования. Он задаёт направляющий вопрос или предлагает подумать об одном недостающем элементе, чтобы ученик сам сформулировал следующий ход;
- client_reply содержит только живую реплику заказчика из 1–3 предложений;
- deal_status: ongoing, won или lost. Для won нужен score не ниже 65 и явное согласие клиента;
- избегай одинаковых конструкций, канцелярита и учебных лекций.`,
        input:[
          {role:"developer",content:"Карточка текущего заказчика: "+JSON.stringify(scenario||{})},
          ...conversation,
          {role:"user",content:"Последнее сообщение монтажёра: "+message}
        ],
        max_output_tokens:900,
        text:{format:{type:"json_schema",name:"client_simulator",strict:true,schema:resultSchema}}
      })
    });
    if(!response.ok){console.error("Simulator OpenAI error",response.status,await response.text());return NextResponse.json({demo:true,degraded:true,result:demoReply(message,Array.isArray(history)?history:[],scenario),upstreamStatus:response.status});}
    const data=await response.json();
    const result=JSON.parse(outputText(data));
    if(result.deal_status==="won"&&result.score<65)result.deal_status="ongoing";
    return NextResponse.json({demo:false,result});
  }catch(error){
    console.error("Simulator error",error);
    return NextResponse.json({error:"bad request"},{status:400});
  }
}

function outputText(data:any){
  const raw=data.output_text||data.output?.flatMap((item:any)=>item.content||[]).find((item:any)=>item.type==="output_text")?.text;
  if(!raw)throw new Error("empty model output");
  return raw;
}

function demoReply(message:string,history:Array<{from?:unknown;text?:unknown}>,scenario:any){
  const text=message.toLowerCase();
  const userTurns=history.filter(item=>item?.from==="user").length;
  const price=/₽|руб|тысяч|цен|бюджет|оплат/.test(text);
  const scope=/входит|ролик|секунд|минут|исходник|субтитр|график|верси|формат/.test(text);
  const deadline=/срок|сегодня|завтра|дн|час|пятниц|понедельник|готов/.test(text);
  const edits=/правк|изменен|доработ|раунд/.test(text);
  const value=/за это|потому|включ|результат|задач|просмотр|монтаж|звук|цвет/.test(text);
  const respectful=!/сам виноват|не нравится не берите|без разницы|отстан/.test(text);
  const covered=[price,scope,deadline,edits,value].filter(Boolean).length;
  const score=Math.max(20,Math.min(94,35+covered*10+(message.length>55?7:0)+(respectful?4:-18)));
  const won=score>=65&&price&&scope&&(deadline||edits)&&userTurns>=1;
  const lost=!respectful&&userTurns>=1;
  const budget=typeof scenario?.budget==="string"?scenario.budget:"обозначенный бюджет";
  let clientReply="А что конкретно входит в эту сумму и какой результат я получу?";
  if(lost)clientReply="Пожалуй, продолжать не будем. Мне важен спокойный и понятный рабочий диалог.";
  else if(won)clientReply=`Хорошо, теперь понимаю, за что плачу ${budget}. Условия подходят, договорились — что нужно прислать для старта?`;
  else if(price&&!value)clientReply="Сумму понял, но пока не понял её состав. Какие этапы и результат входят в работу?";
  else if(scope&&!deadline)clientReply="По объёму стало яснее. Когда сможешь показать первый вариант?";
  else if(deadline&&!edits)clientReply="Срок подходит. А если после просмотра понадобится небольшая правка, она входит?";
  else if(covered>=3)clientReply="Звучит уже конкретнее. Что фиксируем как итоговый результат?";
  const missing=!value?"какую пользу и результат получает клиент за эту цену":!scope?"что именно входит в объём":!deadline?"какой реалистичный срок ты готов зафиксировать":!edits?"где проходит граница включённых правок":"какой следующий шаг поможет закрепить договорённость";
  return {
    client_reply:clientReply,
    score,
    feedback:covered>=3?`Ты сделал условия заметно понятнее. Пока не закреплено, ${missing}.`:`Ты сохранил спокойный тон. Подумай, ${missing}.`,
    coach_hint:`Как ты можешь своими словами объяснить ${missing}, не оправдываясь и не снижая ценность работы?`,
    deal_status:lost?"lost":won?"won":"ongoing",
    deal_reason:lost?"Клиент прекратил разговор из-за тона.":won?"Клиент понял ценность, согласовал основные условия и подтвердил сделку.":"Переговоры продолжаются: клиенту нужна ещё одна конкретная договорённость."
  };
}

function demoScenario(recent:string[],round:number){
  const names=["Алина","Максим","Светлана","Руслан","Полина","Игорь","Марина","Денис"];
  const roles=["владелица кофейни","эксперт по фитнесу","менеджер локального бренда","музыкант","автор образовательного блога","владелец интернет-магазина","организатор мероприятий","продюсер подкаста"];
  const projects=["вертикальный ролик о новом продукте","динамичный анонс мероприятия","короткое видео из разговорных исходников","серия из трёх Reels","ролик с субтитрами и демонстрацией товара","тизер нового выпуска"];
  const budgets=["3 000 ₽","5 500 ₽","8 000 ₽","2 500 ₽","12 000 ₽","4 000 ₽"];
  const deadlines=["к вечеру пятницы","за два дня","через неделю","к завтрашнему утру","в течение четырёх дней","без жёсткого срока"];
  const personalities=["говорит коротко и торгуется","дружелюбная, но плохо формулирует задачу","спешит и перескакивает между деталями","сравнивает с другим монтажёром","ценит структуру и задаёт точные вопросы","сомневается после неудачного опыта"];
  const seed=(Date.now()+round*97+recent.join("").length)%100000;
  const pick=<T,>(items:T[],offset:number)=>items[(seed+offset*17)%items.length];
  const client_name=pick(names,1),client_role=pick(roles,2),project=pick(projects,3),budget=pick(budgets,4),deadline=pick(deadlines,5),personality=pick(personalities,6);
  return {
    id:`demo-${round}-${seed}`,
    client_name,
    client_role,
    personality,
    project,
    budget,
    deadline,
    hidden_concern:"Хочет убедиться, что цена связана с понятным результатом и правки не превратятся в бесконечную работу.",
    difficulty:round%3===0?"Базовая":round%3===1?"Средняя":"Сложная",
    opening_message:`Привет! Нужен ${project}, бюджет примерно ${budget}. Сможешь сделать ${deadline}? Только объясни, что войдёт в работу.`
  };
}
