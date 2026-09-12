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
      return NextResponse.json({demo:true,result:demo(message),reason:!user?"auth_required_for_live_ai":"openai_not_configured"});
    }

    const conversation=Array.isArray(history)?history.slice(-8).map((m:any)=>({
      role:m.from==="client"?"assistant":"user",
      content:String(m.text||"")
    })):[];
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:"Ты играешь роль обычного клиента видеомонтажёра и помогаешь ученику тренироваться. Пиши простыми русскими словами. Не используй сложные деловые термины без объяснения. После ответа ученика оцени: понятно ли он написал, уточнил ли срок, цену, объём и правки. Feedback должен быть коротким: сначала что получилось, потом 1–2 вещи для исправления. Better_answer должен звучать как простое реальное сообщение клиенту. Клиент реалистичный и спокойный, не токсичный.",
        input:[
          ...conversation,
          {role:"user",content:"Сценарий: "+String(scenario||"Клиент просит сделать дешевле и быстрее.")+"\nОтвет монтажёра: "+message}
        ],
        max_output_tokens:700,
        text:{format:{type:"json_schema",name:"client_simulator",strict:true,schema}}
      })
    });
    if(!r.ok){const detail=await r.text();console.error("Simulator OpenAI error",r.status,detail);return NextResponse.json({demo:true,degraded:true,result:demo(message),upstreamStatus:r.status});}
    const data=await r.json();
    const raw=data.output_text||data.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
    return NextResponse.json({demo:false,result:JSON.parse(raw)});
  }catch(error){
    console.error("Simulator error",error);
    return NextResponse.json({error:"bad request"},{status:400});
  }
}

function demo(message:string){
  const good=message.length>45;
  return {
    client_reply:good?"Понял. А если оставить текущий бюджет, что именно войдёт в работу и сколько будет правок?":"Но у другого монтажёра дешевле. Почему мне платить больше?",
    score:good?78:52,
    feedback:good?"Ты не ушёл сразу в скидку и начал фиксировать объём. Добавь точное количество правок и дедлайн.":"Ответ слишком короткий: ты не выяснил объём и не объяснил ценность.",
    better_answer:"Могу уложиться в ваш бюджет, если зафиксируем объём: один ролик до 30 секунд, один раунд правок и готовность к пятнице. Если нужны дополнительные версии или больше правок — посчитаю отдельным пакетом."
  };
}
