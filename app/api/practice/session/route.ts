import {after,NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {tryPracticeSessionSaveCanary} from "@/lib/go-practice-session-canary";
import {practiceSessionReadCanaryEnabled,recordPracticeSessionReadCanaryComparison,tryPracticeSessionReadCanary} from "@/lib/go-practice-session-read-canary";
import {comparePracticeSessionWithGo,normalizePracticeSessionResponse,practiceSessionShadowEnabled} from "@/lib/go-practice-session-shadow";

function bearer(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

async function access(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  return user&&service&&token?{user,service,token}:null;
}

export async function GET(req:NextRequest){
  const a=await access(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});

  const canary=await tryPracticeSessionReadCanary(a.token);
  if(canary.attempted&&canary.value){
    after(async()=>{
      try{
        const {data,error}=await a.service.from("practice_sessions")
          .select("scenario,messages,result,updated_at")
          .eq("user_id",a.user.id)
          .maybeSingle();
        const legacy=!error?normalizePracticeSessionResponse(data):null;
        recordPracticeSessionReadCanaryComparison(canary.value!,legacy);
      }catch{
        recordPracticeSessionReadCanaryComparison(canary.value!,null);
      }
    });
    return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}});
  }

  const {data,error}=await a.service.from("practice_sessions")
    .select("scenario,messages,result,updated_at")
    .eq("user_id",a.user.id)
    .maybeSingle();
  if(error)return NextResponse.json({error:"Ошибка загрузки тренировки."},{status:503});
  const legacy=normalizePracticeSessionResponse(data);
  if(!legacy)return NextResponse.json({error:"Данные тренировки повреждены."},{status:500});
  if(!practiceSessionReadCanaryEnabled()&&practiceSessionShadowEnabled())after(()=>comparePracticeSessionWithGo(a.token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const a=await access(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});
  const body=await req.json().catch(()=>({}));
  const scenario=String(body?.scenario||"").trim().slice(0,2000);
  const messages=Array.isArray(body?.messages)?body.messages.slice(-50).map((item:any)=>({
    from:item?.from==="client"?"client":"user",
    text:String(item?.text||"").trim().slice(0,2000)
  })).filter((item:any)=>item.text):[];
  const rawResult=body?.result&&typeof body.result==="object"?body.result:null;
  const result=rawResult?{
    client_reply:String(rawResult.client_reply||"").slice(0,2000),
    score:Math.max(0,Math.min(100,Number(rawResult.score)||0)),
    feedback:String(rawResult.feedback||"").slice(0,3000),
    coach_hint:String(rawResult.coach_hint||"").slice(0,3000),
    deal_status:rawResult.deal_status==="won"||rawResult.deal_status==="lost"?rawResult.deal_status:"ongoing",
    deal_reason:String(rawResult.deal_reason||"").slice(0,2000),
    scenario_meta:normalizeScenario(rawResult.scenario_meta)
  }:null;
  const session={scenario,messages,result};
  if(await tryPracticeSessionSaveCanary(a.token,session)){
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }
  const {error}=await a.service.from("practice_sessions").upsert({
    user_id:a.user.id,...session,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error)return NextResponse.json({error:"Ошибка сохранения тренировки."},{status:503});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}

function normalizeScenario(value:any){
  if(!value||typeof value!=="object")return null;
  return {
    id:String(value.id||"").slice(0,160),
    client_name:String(value.client_name||"").slice(0,100),
    client_role:String(value.client_role||"").slice(0,180),
    personality:String(value.personality||"").slice(0,300),
    project:String(value.project||"").slice(0,500),
    budget:String(value.budget||"").slice(0,100),
    deadline:String(value.deadline||"").slice(0,160),
    hidden_concern:String(value.hidden_concern||"").slice(0,500),
    difficulty:value.difficulty==="Средняя"||value.difficulty==="Сложная"?value.difficulty:"Базовая",
    opening_message:String(value.opening_message||"").slice(0,1000),
  };
}
