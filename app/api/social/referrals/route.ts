import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function bearer(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  const [{data:profile},{data:refs}]=await Promise.all([
    service.from("profiles").select("referral_code,referral_points,xp,plan,plan_expires_at").eq("id",user.id).maybeSingle(),
    service.from("referrals").select("status,created_at,qualified_at,referred_id").eq("referrer_id",user.id).order("created_at",{ascending:false})
  ]);
  return NextResponse.json({
    code:profile?.referral_code||null,
    points:Number(profile?.referral_points||0),
    qualified:(refs||[]).filter((r:any)=>r.status==="qualified").length,
    pending:(refs||[]).filter((r:any)=>r.status==="pending").length,
    reward:{cost:500,label:"30 дней AI PRO"}
  });
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const body=await req.json().catch(()=>({}));
  if(body?.action!=="redeem")return NextResponse.json({error:"Неизвестное действие."},{status:400});

  const {data:profile}=await service.from("profiles").select("referral_points").eq("id",user.id).maybeSingle();
  if(Number(profile?.referral_points||0)<500)return NextResponse.json({error:"Нужно 500 EDITA Points."},{status:400});

  const {data,error}=await service.rpc("redeem_referral_ai_pro",{p_user_id:user.id});
  if(error)return NextResponse.json({error:error.message.includes("NOT_ENOUGH_POINTS")?"Недостаточно баллов.":error.message},{status:400});
  return NextResponse.json({ok:true,expiresAt:data});
}
