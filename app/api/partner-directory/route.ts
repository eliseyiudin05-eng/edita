import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
function bearer(req:NextRequest){return /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization")||"")?.[1]||""}
export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req)),service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const {data:viewer}=await service.from("profiles").select("role").eq("id",user.id).single();
  if(viewer?.role!=="editor")return NextResponse.json({error:"Каталог доступен монтажёрам."},{status:403});
  const {data,error}=await service.from("profiles").select("id,display_name,username,avatar_url,role,onboarding,skills").in("role",["business","creator"]).order("created_at",{ascending:false}).limit(100);
  if(error)return NextResponse.json({error:"Не удалось загрузить каталог."},{status:503});
  return NextResponse.json({partners:(data||[]).map((item:any)=>({id:item.id,displayName:item.display_name||"Партнёр KIVRONIX",username:item.username,avatarUrl:item.avatar_url,kind:item.role==="creator"||item.onboarding?.accountKind==="creator"?"creator":"business",description:item.onboarding?.goal||item.onboarding?.brandDescription||"Ищет специалистов для видеопроектов",skills:item.skills||[]}))},{headers:{"Cache-Control":"no-store"}})
}
