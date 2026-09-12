import {NextRequest,NextResponse} from "next/server";
import {randomBytes} from "crypto";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const v=req.headers.get("authorization");return v?.startsWith("Bearer ")?v.slice(7):null}

async function auth(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles").select("id,role,referral_points").eq("id",user.id).maybeSingle();
  if(!profile)return null;
  return {user,service,profile};
}

async function getOrCreateCode(a:any){
  const {data:existing}=await a.service.from("referral_codes").select("code").eq("user_id",a.user.id).maybeSingle();
  if(existing?.code)return existing.code;
  for(let i=0;i<5;i++){
    const code="ED-"+randomBytes(4).toString("hex").toUpperCase();
    const {data,error}=await a.service.from("referral_codes").insert({user_id:a.user.id,code}).select("code").single();
    if(!error&&data?.code)return data.code;
  }
  throw new Error("Не удалось создать код.");
}

export async function GET(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const code=await getOrCreateCode(a);
  const {count:qualified}=await a.service.from("referrals").select("id",{count:"exact",head:true}).eq("referrer_id",a.user.id).eq("status","qualified");
  const {count:pending}=await a.service.from("referrals").select("id",{count:"exact",head:true}).eq("referrer_id",a.user.id).eq("status","signup");
  const site=process.env.NEXT_PUBLIC_SITE_URL||"https://getedita.app";
  return NextResponse.json({
    code,
    link:site+"/r/"+encodeURIComponent(code),
    points:a.profile.referral_points||0,
    qualified:qualified||0,
    pending:pending||0,
    reward:{points:500,label:"30 дней AI PRO"}
  });
}

export async function POST(req:NextRequest){
  const a=await auth(req);
  if(!a)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));
  if(body?.action!=="redeem")return NextResponse.json({error:"Неизвестное действие."},{status:400});
  if((a.profile.referral_points||0)<500)return NextResponse.json({error:"Нужно 500 баллов."},{status:400});

  const {data,error}=await a.service.rpc("redeem_referral_ai_pro",{p_user_id:a.user.id});
  if(error)return NextResponse.json({error:error.message.includes("NOT_ENOUGH_POINTS")?"Недостаточно баллов.":error.message},{status:400});
  return NextResponse.json({ok:true,expiresAt:data});
}
