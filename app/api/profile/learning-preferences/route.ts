import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

export async function POST(req:NextRequest){
  const h=req.headers.get("authorization");
  const user=await getUserFromAccessToken(h?.startsWith("Bearer ")?h.slice(7):null);
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  const body=await req.json().catch(()=>({}));
  const level=String(body?.level||"").slice(0,80);
  const software=String(body?.software||"").slice(0,80);
  const goal=String(body?.goal||"").slice(0,80);

  const {data:profile}=await service.from("profiles").select("role,onboarding").eq("id",user.id).maybeSingle();
  if(!profile)return NextResponse.json({error:"Профиль отсутствует."},{status:404});
  if(profile.role!=="editor")return NextResponse.json({error:"Эти настройки доступны только монтажёру."},{status:403});

  const onboarding={...(profile.onboarding||{}),level,software,goal};
  const {error}=await service.from("profiles").update({onboarding}).eq("id",user.id);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,onboarding});
}
