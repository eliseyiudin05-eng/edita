import {NextRequest,NextResponse} from "next/server";

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

    if(!process.env.OPENAI_API_KEY){
      return NextResponse.json({demo:true,result:demo(brief)});
    }

    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
        instructions:"Ты senior creative producer EDITA. Преврати сырой запрос бизнеса в чёткое ТЗ для видеомонтажёра. Ничего важного не выдумывай: если данных нет, формулируй нейтрально. Критерии должны быть проверяемыми. Пиши по-русски.",
        input:"Brand context: "+JSON.stringify(brandContext||{})+"\n\nСырой бриф:\n"+brief,
        max_output_tokens:1200,
        text:{format:{type:"json_schema",name:"edita_brief",strict:true,schema}}
      })
    });
    if(!r.ok)return NextResponse.json({error:"AI brief failed",status:r.status},{status:502});
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
