import {after,NextRequest,NextResponse} from "next/server";
import {compareSocialRankingWithGo,normalizeSocialRanking,socialRankingShadowEnabled} from "@/lib/go-social-shadow";
import {getSocialRanking,getUserFromAccessToken} from "@/lib/server-supabase";

function bearer(req:NextRequest){
  const header=req.headers.get("authorization")||"";
  const match=/^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1]||null;
}

export async function GET(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  if(!user||!token)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const {data,error}=await getSocialRanking(token);
  if(error)return NextResponse.json({error:"Не удалось загрузить рейтинг."},{status:503});
  const legacy=normalizeSocialRanking(data,user.id);
  if(!legacy)return NextResponse.json({error:"Данные рейтинга повреждены."},{status:500});

  if(socialRankingShadowEnabled())after(()=>compareSocialRankingWithGo(token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}
