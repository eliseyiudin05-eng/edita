import {after,NextRequest,NextResponse} from "next/server";
import {compareProfileSettingsWithGo,normalizeProfileSettings,profileSettingsShadowEnabled} from "@/lib/go-profile-settings-shadow";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

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

  const {data,error}=await service.from("profiles")
    .select("display_name,username,school_name,avatar_url,show_school_publicly")
    .eq("id",user.id)
    .maybeSingle();
  if(error)return NextResponse.json({error:"Не удалось загрузить профиль."},{status:503});
  if(!data)return NextResponse.json({error:"Профиль отсутствует."},{status:404});
  const legacy=normalizeProfileSettings(data);
  if(!legacy)return NextResponse.json({error:"Профиль повреждён."},{status:500});

  if(profileSettingsShadowEnabled())after(()=>compareProfileSettingsWithGo(token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}
