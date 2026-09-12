import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  const {data:profile}=await service.from("profiles")
    .select("role,onboarding,guardian_verified,editor_verification_level")
    .eq("id",user.id).maybeSingle();
  if(profile?.role!=="editor")return NextResponse.json({error:"Раздел только для монтажёров."},{status:403});

  const {data:request}=await service.from("editor_verification_requests")
    .select("id,portfolio_url,sample_url,note,status,review_note,created_at,reviewed_at")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false})
    .limit(1).maybeSingle();

  return NextResponse.json({
    emailVerified:Boolean(user.email_confirmed_at),
    ageGroup:profile?.onboarding?.ageGroup||"18+",
    guardianVerified:Boolean(profile?.guardian_verified),
    level:profile?.editor_verification_level||"basic",
    request:request||null
  });
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  const {data:profile}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="editor")return NextResponse.json({error:"Раздел только для монтажёров."},{status:403});

  const body=await req.json().catch(()=>({}));
  const portfolioUrl=String(body?.portfolioUrl||"").trim().slice(0,500);
  const sampleUrl=String(body?.sampleUrl||"").trim().slice(0,500);
  const note=String(body?.note||"").trim().slice(0,1200);

  if(!portfolioUrl&&!sampleUrl){
    return NextResponse.json({error:"Добавь ссылку на портфолио или одну работу для проверки."},{status:400});
  }

  const {data:pending}=await service.from("editor_verification_requests")
    .select("id").eq("user_id",user.id).eq("status","pending").maybeSingle();
  if(pending)return NextResponse.json({error:"Заявка уже на проверке."},{status:409});

  const {data,error}=await service.from("editor_verification_requests").insert({
    user_id:user.id,
    portfolio_url:portfolioUrl||null,
    sample_url:sampleUrl||null,
    note:note||null,
    status:"pending"
  }).select("id,status,created_at").single();

  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,request:data});
}
