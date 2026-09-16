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
      return NextResponse.json({demo:true,result:demo(message,Array.isArray(history)?history.length:0),reason:!user?"auth_required_for_live_ai":"openai_not_configured"});
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
        instructions:`Ты играешь живого клиента видеомонтажёра, а ученик тренирует реальные переговоры. Продолжай именно текущий разговор: помни уже названные цену, срок, объём и правки. Реагируй на смысл последнего сообщения, а не повторяй сценарий. У клиента есть характер, сомнения и деловая цель. Иногда он уточняет, соглашается, торгуется, вспоминает новую деталь или просит зафиксировать договорённость. Выбирай естественную реакцию по контексту и не используй одну конструкцию два хода подряд. Пиши разговорно и коротко, как человек в рабочем чате: 1–3 предложения, без канцелярита и лекций. Отдельно оцени ясность, границы работы, цену, срок и число правок. В feedback сначала назови конкретный успех, затем одну главную точку роста. better_answer — естественное сообщение, которое реально можно отправить клиенту.`,
        input:[
          ...conversation,
          {role:"user",content:"Сценарий: "+String(scenario||"Клиент просит сделать дешевле и быстрее.")+"\nОтвет монтажёра: "+message}
        ],
        max_output_tokens:700,
        text:{format:{type:"json_schema",name:"client_simulator",strict:true,schema}}
      })
    });
    if(!r.ok){const detail=await r.text();console.error("Simulator OpenAI error",r.status,detail);return NextResponse.json({demo:true,degraded:true,result:demo(message,conversation.length),upstreamStatus:r.status});}
    const data=await r.json();
    const raw=data.output_text||data.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
    return NextResponse.json({demo:false,result:JSON.parse(raw)});
  }catch(error){
    console.error("Simulator error",error);
    return NextResponse.json({error:"bad request"},{status:400});
  }
}

function demo(message:string,turn=0){
  const good=message.length>45;
  const replies=["Хорошо, так понятнее. Зафиксируем срок и что именно я получу в финале?","Понял про объём. А одна небольшая правка после просмотра входит?","Договорились. Пришли одним сообщением итог: цена, срок и формат файла."];
  return {
    client_reply:good?replies[Math.floor(turn/2)%replies.length]:"Я пока не понял, что войдёт в эту сумму. Можешь назвать объём, срок и число правок?",
    score:good?78:52,
    feedback:good?"Ты сохранил цену и начал фиксировать объём. Добавь точное число правок и срок.":"Ответ слишком короткий: уточни объём и объясни ценность своей работы.",
    better_answer:"Могу уложиться в ваш бюджет, если зафиксируем объём: один ролик до 30 секунд, один раунд правок и готовность к пятнице. Если нужны дополнительные версии или больше правок — посчитаю отдельным пакетом."
  };
}
