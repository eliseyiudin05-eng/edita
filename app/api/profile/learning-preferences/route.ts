import {after,NextRequest,NextResponse} from "next/server";
import {getProfileLearningPreferences,getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {compareLearningPreferencesWithGo,learningPreferencesShadowEnabled,normalizeLearningPreferences} from "@/lib/go-profile-shadow";

function accessToken(req:NextRequest){
  const header=req.headers.get("authorization")||"";
  const match=/^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1]||null;
}

export async function GET(req:NextRequest){
  const token=accessToken(req);
  const user=await getUserFromAccessToken(token);
  if(!user||!token)return NextResponse.json({error:"Нужен вход."},{status:401});

  const {data:profile,error}=await getProfileLearningPreferences(token,user.id);
  if(error)return NextResponse.json({error:"Не удалось загрузить профиль."},{status:503});
  if(!profile)return NextResponse.json({error:"Профиль отсутствует."},{status:404});
  const legacy=normalizeLearningPreferences(profile.role,profile.onboarding);
  if(!legacy)return NextResponse.json({error:"Профиль повреждён."},{status:500});

  if(token&&learningPreferencesShadowEnabled())after(()=>compareLearningPreferencesWithGo(token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(accessToken(req));
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
