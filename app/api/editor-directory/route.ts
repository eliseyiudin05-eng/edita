import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {moderateReviewText} from "@/lib/content-moderation";

function bearer(req:NextRequest){const value=req.headers.get("authorization")||"";return value.startsWith("Bearer ")?value.slice(7):null}

async function auth(req:NextRequest){
  const service=getSupabaseServiceClient();
  const user=await getUserFromAccessToken(bearer(req));
  if(!service||!user)return null;
  const {data:profile}=await service.from("profiles").select("id,role,onboarding").eq("id",user.id).maybeSingle();
  return profile?{service,user,profile}:null;
}

export async function GET(req:NextRequest){
  const current=await auth(req);
  if(!current)return NextResponse.json({error:"Войдите в аккаунт."},{status:401});
  if(current.profile.role!=="business")return NextResponse.json({error:"Каталог доступен компаниям и блогерам."},{status:403});
  const [{data:editors,error},{data:portfolio},{data:reviews}]=await Promise.all([
    current.service.from("public_profiles").select("id,display_name,username,avatar_url,level,xp,ai_score,skills,editor_verification_level,rating_points").order("rating_points",{ascending:false}).limit(100),
    current.service.from("portfolio_items").select("editor_id"),
    current.service.from("editor_reviews").select("editor_id,rating").eq("moderation_status","approved")
  ]);
  if(error)return NextResponse.json({error:"Не удалось загрузить каталог монтажёров."},{status:503});
  const portfolioCount:Record<string,number>={};for(const item of portfolio||[])portfolioCount[item.editor_id]=(portfolioCount[item.editor_id]||0)+1;
  const reviewMap:Record<string,{sum:number;count:number}>={};for(const item of reviews||[]){const row=reviewMap[item.editor_id]||{sum:0,count:0};row.sum+=Number(item.rating);row.count++;reviewMap[item.editor_id]=row}
  return NextResponse.json({editors:(editors||[]).map((editor:any)=>({
    ...editor,portfolioCount:portfolioCount[editor.id]||0,
    reviewCount:reviewMap[editor.id]?.count||0,
    rating:reviewMap[editor.id]?.count?Math.round(reviewMap[editor.id].sum/reviewMap[editor.id].count*10)/10:null,
    levelLabel:levelLabel(Number(editor.level||1),Number(editor.xp||0))
  }))},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const current=await auth(req);
  if(!current)return NextResponse.json({error:"Войдите в аккаунт."},{status:401});
  if(current.profile.role!=="business")return NextResponse.json({error:"Оставлять отзывы могут компании и блогеры после диалога."},{status:403});
  const body=await req.json().catch(()=>({}));
  const editorId=String(body?.editorId||"");const rating=Number(body?.rating);const comment=String(body?.comment||"").trim().slice(0,800);
  if(!Number.isInteger(rating)||rating<1||rating>5)return NextResponse.json({error:"Поставьте оценку от 1 до 5."},{status:400});
  const moderation=await moderateReviewText(comment);
  if(!moderation.allowed)return NextResponse.json({error:moderation.message},{status:400});
  const {data:conversation}=await current.service.from("private_conversations").select("id").eq("business_owner_id",current.user.id).eq("editor_id",editorId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!conversation)return NextResponse.json({error:"Отзыв доступен после реального диалога с монтажёром."},{status:403});
  const {error}=await current.service.from("editor_reviews").upsert({editor_id:editorId,reviewer_id:current.user.id,conversation_id:conversation.id,rating,comment,moderation_status:"approved",moderation_note:"Автоматическая проверка: оскорбления и личные данные не обнаружены",updated_at:new Date().toISOString()},{onConflict:"editor_id,reviewer_id,conversation_id"});
  if(error)return NextResponse.json({error:"Не удалось сохранить отзыв."},{status:500});
  return NextResponse.json({ok:true,status:"approved"});
}

function levelLabel(level:number,xp:number){if(level>=5||xp>=3000)return "PRO";if(level>=4||xp>=1800)return "Продвинутый";if(level>=3||xp>=900)return "Уверенный";if(level>=2||xp>=300)return "Начинающий+";return "Начинающий"}
