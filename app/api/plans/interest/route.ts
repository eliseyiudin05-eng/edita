import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import type {FuturePlanId,PlanAudience} from "@/lib/plans";

const choices:Record<PlanAudience,FuturePlanId>={editor:"creator_plus",business:"studio_plus"};

function bearer(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в KIVRONIX."},{status:401});

  const body=await req.json().catch(()=>({}));
  const audience=String(body?.audience||"") as PlanAudience;
  const plan=String(body?.plan||"") as FuturePlanId;
  if(!(audience in choices)||choices[audience]!==plan){
    return NextResponse.json({error:"Такой тариф пока отсутствует."},{status:400});
  }

  const {data:profile}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  const expectedAudience=profile?.role==="business"?"business":"editor";
  if(audience!==expectedAudience){
    return NextResponse.json({error:"Тариф должен соответствовать типу аккаунта."},{status:409});
  }

  const {error}=await service.from("future_plan_interest").upsert({
    user_id:user.id,
    audience,
    wanted_plan:plan,
    updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  if(error)return NextResponse.json({error:"Интерес пока не сохранился."},{status:500});
  return NextResponse.json({ok:true,audience,plan,paymentsEnabled:false});
}
