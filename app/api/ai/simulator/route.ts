import {NextRequest,NextResponse} from "next/server";
import {getUserFromAccessToken} from "@/lib/server-supabase";

const schema={
  type:"object",
  additionalProperties:false,
  properties:{
    client_reply:{type:"string"},
    score:{type:"integer",minimum:0,maximum:100},
    feedback:{type:"string"},
    better_answer:{type:"string"}
  },
  required:["client_reply","score","feedback","better_answer"]
};

export async function POST(req:NextRequest){
  try{
    const {message,history,scenario}=await req.json();
    if(!message||typeof message!=="string")return NextResponse.json({error:"message required"},{status:400});

    const bearer=req.headers.get("authorization");
    const token=bearer?.startsWith("Bearer ")?bearer.slice(7):null;
    const user=await getUserFromAccessToken(token);
    if(!process.env.OPENAI_API_KEY||!user){
      return NextResponse.json({demo:true,result:demo(message,Array.isArray(history)?history:[]),reason:!user?"auth_required_for_live_ai":"openai_not_configured"});
    }

    const conversation=Array.isArray(history)?history.slice(-14).map((m:any)=>({
      role:m.from==="client"?"assistant":"user",
      content:String(m.text||"")
    })):[];
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:`Ты — настоящий клиент в рабочем чате с видеомонтажёром. У тебя есть характер, настроение, сомнения, бюджет и деловая цель. Продолжай именно текущий разговор и помни всё, о чём уже договорились: цену, срок, длительность ролика, формат, число версий и правок. Реагируй прежде всего на последнее сообщение монтажёра. Если он уже ответил на вопрос, не спрашивай то же самое другими словами. Не обязан каждый раз задавать вопрос: можешь согласиться, отказаться, коротко отреагировать, поторговаться, уточнить только одну действительно недостающую деталь, вспомнить новую деталь или естественно завершить договорённость. Меняй длину и интонацию сообщений, иногда пиши очень коротко. Не используй одинаковое начало два хода подряд и не говори как преподаватель. client_reply — только реплика клиента из 1–3 разговорных предложений. feedback — отдельная спокойная оценка ответа ученика: назови конкретный успех и одну главную точку роста. better_answer — естественное сообщение, которое реально можно отправить клиенту. Оцени ясность, границы работы, цену, срок и правки с учётом уже состоявшегося диалога.`,
        input:[
          ...conversation,
          {role:"user",content:"Сценарий: "+String(scenario||"Клиент просит сделать дешевле и быстрее.")+"\nОтвет монтажёра: "+message}
        ],
        max_output_tokens:700,
        text:{format:{type:"json_schema",name:"client_simulator",strict:true,schema}}
      })
    });
    if(!r.ok){const detail=await r.text();console.error("Simulator OpenAI error",r.status,detail);return NextResponse.json({demo:true,degraded:true,result:demo(message,Array.isArray(history)?history:[]),upstreamStatus:r.status});}
    const data=await r.json();
    const raw=data.output_text||data.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
    return NextResponse.json({demo:false,result:JSON.parse(raw)});
  }catch(error){
    console.error("Simulator error",error);
    return NextResponse.json({error:"bad request"},{status:400});
  }
}

function demo(message:string,history:Array<{from?:unknown;text?:unknown}>){
  const text=message.toLowerCase();
  const turn=history.filter(item=>item?.from==="user").length;
  const mentionsPrice=/₽|руб|цен|бюджет|оплат/.test(text);
  const mentionsDeadline=/срок|сегодня|завтра|дн|час|пятниц|понедельник|готов/.test(text);
  const mentionsScope=/ролик|секунд|минут|формат|верси|исходник|субтитр/.test(text);
  const mentionsEdits=/правк|изменен|доработ/.test(text);
  const agrees=/договорились|согласен|подходит|сделаю|зафиксир/.test(text);
  const covered=[mentionsPrice,mentionsDeadline,mentionsScope,mentionsEdits].filter(Boolean).length;
  const score=Math.min(92,48+covered*10+(message.length>45?8:0)+(agrees?5:0));
  const shortReplies=[
    "Пока слишком общо. Сколько это будет стоить и когда получу готовый ролик?",
    "Не совсем понял условия. Что конкретно входит в работу?",
    "Хочу убедиться, что мы одинаково поняли задачу. Назови итоговую цену и срок.",
  ];
  let clientReply=shortReplies[turn%shortReplies.length];
  if(agrees&&covered>=2)clientReply=turn%2===0?"Отлично, договорились. Тогда жду первый вариант в обозначенный срок.":"Хорошо, меня всё устраивает. Можешь начинать.";
  else if(mentionsPrice&&mentionsEdits)clientReply="Так уже понятнее. Если одна правка входит в эту сумму, я готов обсудить срок.";
  else if(mentionsDeadline&&mentionsScope)clientReply="По сроку подходит. Скажи только итоговую стоимость — и можем начинать.";
  else if(covered>=2)clientReply=turn%2===0?"Окей, звучит разумно. Что тебе нужно от меня для старта?":"Понял. Давай тогда зафиксируем это и начнём.";
  const missing=!mentionsPrice?"итоговую цену":!mentionsDeadline?"точный срок":!mentionsScope?"объём результата":!mentionsEdits?"число правок":"следующий шаг";
  return {
    client_reply:clientReply,
    score,
    feedback:covered>=3?`Условия звучат уверенно и конкретно. Для полного закрепления добавь ${missing}.`:`Ответ движет разговор вперёд. Теперь обозначь ${missing}, чтобы у клиента не осталось разных трактовок.`,
    better_answer:"Предлагаю зафиксировать: один ролик до 30 секунд, одна версия, один раунд правок, готовность к пятнице. Итоговая стоимость — 3 000 ₽. Если всё подходит, присылайте исходники — начну сегодня."
  };
}
