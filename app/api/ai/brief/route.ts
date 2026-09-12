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
    if(!brief||typeof brief!=="string")return NextResponse.json({error:"brief required"},{status:400});

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
        instructions:"Ты помощник EDITA для бизнеса. Преврати сырой запрос в очень понятное ТЗ для монтажёра. Пиши простыми русскими словами. Если нужно слово вроде CTA или B-roll, сразу объясни его. Ничего важного не выдумывай. Критерии должны быть такими, чтобы человек мог ответить «да, выполнено» или «нет».",
        input:"Brand context: "+JSON.stringify(brandContext||{})+"\n\nСырой бриф:\n"+brief,
        max_output_tokens:1200,
        text:{format:{type:"json_schema",name:"edita_brief",strict:true,schema}}
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
    title:"Коммерческий short-form ролик",
    goal:"Передать ключевую ценность продукта и удержать внимание до CTA.",
    duration:"20–30 секунд",
    format:"9:16, short-form",
    must_haves:["Сильный hook в первые 2 секунды","Продукт/герой показан понятно","CTA в финале"],
    avoid:["Перегруженные переходы","Музыка громче речи"],
    checklist:["9:16","20–30 секунд","Hook ≤2 сек","Читаемые субтитры","CTA","Соответствие исходному брифу"],
    judging_criteria:["Понятность идеи","Удержание","Чистота монтажа","Соответствие бренду"]
  };
}
