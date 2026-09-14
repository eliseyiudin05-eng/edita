import {after,NextRequest,NextResponse} from "next/server";
import {profileSettingsCanaryEnabled,recordProfileSettingsCanaryComparison,tryProfileSettingsCanary} from "@/lib/go-profile-settings-canary";
import {tryProfileSettingsUpdateCanary} from "@/lib/go-profile-settings-update-canary";
import {compareProfileSettingsWithGo,normalizeProfileSettings,profileSettingsShadowEnabled,sameProfileSettings} from "@/lib/go-profile-settings-shadow";
import {getSupabaseServiceClient,getUserFromAccessToken,updateProfileSettings} from "@/lib/server-supabase";

function bearer(req:NextRequest){
  const header=req.headers.get("authorization")||"";
  return /^Bearer ([^\s]+)$/i.exec(header)?.[1]||null;
}

export async function GET(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  if(!user||!token)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  if(!service)return NextResponse.json({error:"Сервис профиля недоступен."},{status:503});

  const canary=await tryProfileSettingsCanary(token);
  if(canary.attempted&&canary.value){
    after(async()=>{
      try{
        const {data,error}=await service.from("profiles")
          .select("display_name,username,school_name,avatar_url,show_school_publicly")
          .eq("id",user.id)
          .maybeSingle();
        const legacy=!error&&data?normalizeProfileSettings(data):null;
        recordProfileSettingsCanaryComparison(canary.value!,legacy);
      }catch{
        recordProfileSettingsCanaryComparison(canary.value!,null);
      }
    });
    return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}});
  }

  const {data,error}=await service.from("profiles")
    .select("display_name,username,school_name,avatar_url,show_school_publicly")
    .eq("id",user.id)
    .maybeSingle();
  if(error)return NextResponse.json({error:"Не удалось загрузить профиль."},{status:503});
  if(!data)return NextResponse.json({error:"Профиль отсутствует."},{status:404});
  const legacy=normalizeProfileSettings(data);
  if(!legacy)return NextResponse.json({error:"Профиль повреждён."},{status:500});

  if(!profileSettingsCanaryEnabled()&&profileSettingsShadowEnabled())after(()=>compareProfileSettingsWithGo(token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  if(!user||!token)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return NextResponse.json({error:"Ожидаются настройки профиля в формате JSON."},{status:400});
  }

  const input=normalizeUpdate(await req.json().catch(()=>null));
  if(!input)return NextResponse.json({error:"Проверь имя, адрес страницы и остальные поля профиля."},{status:400});

  const canary=await tryProfileSettingsUpdateCanary(token,input);
  if(canary)return NextResponse.json(canary,{headers:{"Cache-Control":"no-store"}});

  const {data,error}=await updateProfileSettings(token,user.id,input);
  if(error){
    if(error.code==="23505")return NextResponse.json({error:"Этот адрес страницы уже занят. Попробуй другой."},{status:409});
    return NextResponse.json({error:"Не удалось сохранить профиль."},{status:503});
  }
  const saved=normalizeProfileSettings(data);
  if(!saved||!sameProfileSettings(saved,input))return NextResponse.json({error:"Профиль сохранился с некорректным ответом."},{status:503});
  return NextResponse.json(saved,{headers:{"Cache-Control":"no-store"}});
}

function normalizeUpdate(value:unknown){
  const normalized=normalizeProfileSettings(value);
  if(!normalized)return null;
  const displayName=normalized.displayName.trim().replace(/\s+/g," ");
  const username=normalized.username.trim().replace(/^@/,"").toLowerCase();
  const schoolName=normalized.schoolName.trim().replace(/\s+/g," ");
  const avatarUrl=normalized.avatarUrl.trim();
  if(displayName.length<2||[...displayName].length>120||!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username))return null;
  if(schoolName&&([...schoolName].length<2||[...schoolName].length>160))return null;
  if(avatarUrl){
    try{
      const parsed=new URL(avatarUrl);
      if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.hash||avatarUrl.length>4096)return null;
    }catch{return null;}
  }
  return {displayName,username,schoolName,avatarUrl,showSchoolPublicly:Boolean(schoolName&&normalized.showSchoolPublicly)};
}
