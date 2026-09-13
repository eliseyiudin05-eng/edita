import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {pointsRedemptionEnabled} from "@/lib/plans";

const rewards=[
  {id:"creator_plus_30",name:"Creator+ на 30 дней",cost:500,description:"Расширенные инструменты монтажёра после запуска платных планов."}
];

function bearer(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  const [{data:profile},{data:refs},{data:redemptions}]=await Promise.all([
    service.from("profiles").select("referral_code,referral_points,xp").eq("id",user.id).maybeSingle(),
    service.from("referrals").select("status,created_at,qualified_at,referred_id").eq("referrer_id",user.id).order("created_at",{ascending:false}),
    service.from("referral_redemptions").select("id,points_spent,reward,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(20)
  ]);
  return NextResponse.json({
    code:profile?.referral_code||null,
    points:Number(profile?.referral_points||0),
    qualified:(refs||[]).filter((r:any)=>r.status==="qualified").length,
    pending:(refs||[]).filter((r:any)=>r.status==="pending").length,
    rewards,
    redemptions:redemptions||[],
    redemptionEnabled:pointsRedemptionEnabled
  });
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  if(!pointsRedemptionEnabled){
    return NextResponse.json({error:"Обмен KIVRONIX Points подготовлен и включится вместе с Creator+. Баллы уже можно накапливать."},{status:409});
  }

  const body=await req.json().catch(()=>({}));
  const reward=String(body?.reward||"");
  if(!rewards.some(item=>item.id===reward))return NextResponse.json({error:"Такая награда отсутствует."},{status:400});
  const {data,error}=await service.rpc("redeem_kivronix_points",{p_user_id:user.id,p_reward:reward});
  if(error){
    const reason=String(error.message||"");
    return NextResponse.json({error:reason.includes("NOT_ENOUGH_POINTS")?"Пока не хватает KIVRONIX Points.":"Обмен пока не завершился."},{status:409});
  }
  return NextResponse.json({ok:true,reward,planExpiresAt:data});
}
