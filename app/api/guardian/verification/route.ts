import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function tokenFrom(req:NextRequest){
  const bearer=req.headers.get("authorization");
  return bearer?.startsWith("Bearer ")?bearer.slice(7):null;
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(tokenFrom(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const {data:profile}=await service.from("profiles")
    .select("role,onboarding,guardian_verified")
    .eq("id",user.id).maybeSingle();

  const ageGroup=profile?.onboarding?.ageGroup||"18+";
  if(profile?.role!=="editor"||ageGroup==="18+"){
    return NextResponse.json({needed:false,verified:Boolean(profile?.guardian_verified),request:null});
  }

  const {data:request}=await service.from("guardian_verification_requests")
    .select("id,guardian_name,guardian_email,relationship,method,status,review_note,created_at,reviewed_at")
    .eq("user_id",user.id)
    .order("created_at",{ascending:false})
    .limit(1).maybeSingle();

  return NextResponse.json({needed:true,verified:Boolean(profile?.guardian_verified),request:request||null});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(tokenFrom(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const {data:profile}=await service.from("profiles")
    .select("role,onboarding,guardian_verified")
    .eq("id",user.id).maybeSingle();

  const ageGroup=profile?.onboarding?.ageGroup||"18+";
  if(profile?.role!=="editor"||ageGroup==="18+"){
    return NextResponse.json({error:"Этот аккаунт уже доступен по возрасту."},{status:400});
  }
  if(profile?.guardian_verified)return NextResponse.json({ok:true,verified:true});

  const body=await req.json();
  const guardianName=String(body?.guardianName||"").trim().slice(0,160);
  const guardianEmail=String(body?.guardianEmail||"").trim().toLowerCase().slice(0,254);
  const relationship=String(body?.relationship||"").trim().slice(0,80);

  if(!guardianName||!guardianEmail.includes("@")||!relationship){
    return NextResponse.json({error:"Заполни имя родителя, его электронную почту и кем он тебе приходится."},{status:400});
  }

  const {data,error}=await service.from("guardian_verification_requests").insert({
    user_id:user.id,
    guardian_name:guardianName,
    guardian_email:guardianEmail,
    relationship,
    method:"manual",
    status:"pending"
  }).select("id,status,created_at").single();

  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,request:data});
}
