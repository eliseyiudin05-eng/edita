import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function bearer(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

async function access(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  return user&&service?{user,service}:null;
}

export async function GET(req:NextRequest){
  const a=await access(req);
  if(!a)return NextResponse.json({error:"Нужен вход."},{status:401});
  const {data,error}=await a.service.from("practice_sessions")
    .select("scenario,messages,result,updated_at")
    .eq("user_id",a.user.id)
    .maybeSingle();
  if(error)return NextResponse.json({error:"Не удалось загрузить тренировку."},{status:503});
  return NextResponse.json({session:data||null});
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
  const {error}=await a.service.from("practice_sessions").upsert({
    user_id:a.user.id,scenario,messages,result,updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error)return NextResponse.json({error:"Не удалось сохранить тренировку."},{status:503});
  return NextResponse.json({ok:true});
}
