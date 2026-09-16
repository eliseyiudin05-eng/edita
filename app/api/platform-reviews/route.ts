import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {moderateReviewText} from "@/lib/content-moderation";

function bearer(req:NextRequest){return /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization")||"")?.[1]||""}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const {data}=await service.from("testimonials").select("id,text,rating,status,approved,reward_awarded").eq("author_id",user.id).maybeSingle();
  return NextResponse.json({review:data||null},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));const text=String(body.text||"").trim().slice(0,1400),rating=Number(body.rating);
  if(text.length<40||!Number.isInteger(rating)||rating<1||rating>5)return NextResponse.json({error:"Напиши не меньше 40 символов и поставь оценку."},{status:400});
  const moderation=await moderateReviewText(text);if(!moderation.allowed)return NextResponse.json({error:moderation.message},{status:400});
  const {data:profile}=await service.from("profiles").select("display_name,role,onboarding").eq("id",user.id).single();
  const accountKind=profile?.onboarding?.accountKind;const roleLabel=profile?.role==="editor"?"Монтажёр":accountKind==="creator"?"Блогер":"Компания";
  const {error}=await service.from("testimonials").insert({author_id:user.id,body:text,text,display_name:profile?.display_name||"Пользователь KIVRONIX",role_label:roleLabel,rating,status:"pending",approved:false,permission_to_publish:true});
  if(error?.code==="23505")return NextResponse.json({error:"Отзыв и награду можно получить только один раз."},{status:409});
  if(error)return NextResponse.json({error:"Не удалось отправить отзыв."},{status:503});
  return NextResponse.json({ok:true,status:"pending"});
}
