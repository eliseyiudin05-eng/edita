import {NextRequest,NextResponse} from "next/server";
import {getUserFromAccessToken} from "@/lib/server-supabase";

const schema={
  type:"object",
  additionalProperties:false,
  properties:{
    title:{type:"string"},
    goal:{type:"string"},
    duration:{type:"string"},
    format:{type:"string"},
    must_haves:{type:"array",items:{type:"string"}},
    avoid:{type:"array",items:{type:"string"}},
    checklist:{type:"array",items:{type:"string"}},
    judging_criteria:{type:"array",items:{type:"string"}}
  },
  required:["title","goal","duration","format","must_haves","avoid","checklist","judging_criteria"]
};

export async function POST(req:NextRequest){
  try{
    const {brief,brandContext}=await req.json();
    if(!brief||typeof brief!=="string")return NextResponse.json({error:"Добавьте черновик задания."},{status:400});

    const bearer=req.headers.get("authorization");
    const token=bearer?.startsWith("Bearer ")?bearer.slice(7):null;
    const user=await getUserFromAccessToken(token);
    if(!process.env.OPENAI_API_KEY||!user){
      return NextResponse.json({demo:true,result:demo(brief),reason:!user?"auth_required_for_live_ai":"openai_not_configured"});
    }

    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:"Ты помощник KIVRONIX для компании. Преврати черновик в очень понятное задание для монтажёра. Пиши простыми русскими словами. Каждый английский термин сразу объясняй. Используй только данные компании. Критерии формулируй так, чтобы человек мог легко проверить выполнение. Пиши спокойными утвердительными фразами.",
        input:"Данные компании: "+JSON.stringify(brandContext||{})+"\n\nЧерновик задания:\n"+brief,
        max_output_tokens:1200,
        text:{format:{type:"json_schema",name:"kivronix_brief",strict:true,schema}}
      })
    });
    if(!r.ok){const detail=await r.text();console.error("AI brief OpenAI error",r.status,detail);return NextResponse.json({demo:true,degraded:true,result:demo(brief),upstreamStatus:r.status});}
    const data=await r.json();
    const raw=data.output_text||data.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;
    return NextResponse.json({demo:false,result:JSON.parse(raw)});
  }catch(error){
    console.error("AI brief error",error);
    return NextResponse.json({error:"bad request"},{status:400});
  }
}

function demo(brief:string){
  return {
    title:"Короткий рекламный ролик",
    goal:"Понятно показать пользу продукта и удержать внимание до последнего кадра.",
    duration:"20–30 секунд",
    format:"Вертикальное видео 9:16",
    must_haves:["Яркое начало в первые 2 секунды","Продукт или герой показан понятно","В конце зрителю ясно, что сделать дальше"],
    avoid:["Перегруженные переходы","Музыка громче речи"],
    checklist:["Вертикальное видео 9:16","20–30 секунд","Яркое начало до 2 секунд","Читаемые субтитры","Понятный следующий шаг","Соответствие исходному заданию"],
    judging_criteria:["Понятность идеи","Удержание","Чистота монтажа","Соответствие бренду"]
  };
}
