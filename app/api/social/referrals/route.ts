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
    service.from("profiles").select("referral_code,referral_points,xp").eq("id",user.id).maybeSingle(),
    service.from("referrals").select("status,created_at,qualified_at,referred_id").eq("referrer_id",user.id).order("created_at",{ascending:false})
  ]);
  return NextResponse.json({
    code:profile?.referral_code||null,
    points:Number(profile?.referral_points||0),
    qualified:(refs||[]).filter((r:any)=>r.status==="qualified").length,
    pending:(refs||[]).filter((r:any)=>r.status==="pending").length
  });
}
