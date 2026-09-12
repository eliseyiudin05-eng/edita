import {NextRequest,NextResponse} from "next/server";
import {lessonBySlug} from "@/lib/curriculum";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function bearer(req:NextRequest){
  const header=req.headers.get("authorization");
  return header?.startsWith("Bearer ")?header.slice(7):null;
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const body=await req.json().catch(()=>({}));
  const lesson=lessonBySlug(String(body?.slug||""));
  const completed=body?.completed!==false;
  if(!lesson)return NextResponse.json({error:"Урок не найден."},{status:404});

  const {data:lessonRow,error:lessonError}=await service.from("lessons").upsert({
    slug:lesson.slug,
    title:lesson.title,
    xp_reward:lesson.xp,
    content:{module:lesson.module,track:lesson.track,software:lesson.software,level:lesson.level,minutes:lesson.minutes},
    published:true
  },{onConflict:"slug"}).select("id").single();
  if(lessonError||!lessonRow)return NextResponse.json({error:"Не удалось синхронизировать урок."},{status:503});

  if(completed){
    const {error}=await service.from("lesson_progress").upsert({
      user_id:user.id,
      lesson_id:lessonRow.id,
      status:"completed",
      completed_at:new Date().toISOString()
    },{onConflict:"user_id,lesson_id"});
    if(error)return NextResponse.json({error:"Не удалось сохранить прогресс."},{status:503});
  }else{
    const {error}=await service.from("lesson_progress").delete().eq("user_id",user.id).eq("lesson_id",lessonRow.id);
    if(error)return NextResponse.json({error:"Не удалось снять отметку."},{status:503});
  }

  return NextResponse.json({ok:true,completed,slug:lesson.slug});
}
