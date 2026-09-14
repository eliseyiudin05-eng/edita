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
    better_answer:String(rawResult.better_answer||"").slice(0,3000)
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
