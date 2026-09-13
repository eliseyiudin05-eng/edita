import {after,NextRequest,NextResponse} from "next/server";
import {curriculum,lessonBySlug} from "@/lib/curriculum";
import {academyProgressShadowEnabled,compareAcademyProgressWithGo,normalizeAcademyProgress} from "@/lib/go-academy-shadow";
import {getLessonProgress,getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function bearer(req:NextRequest){
  const header=req.headers.get("authorization")||"";
  const match=/^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1]||null;
}

export async function GET(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  if(!user||!token)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const {data,error}=await getLessonProgress(token,user.id);
  if(error)return NextResponse.json({error:"Не удалось загрузить прогресс."},{status:503});
  const legacy=normalizeAcademyProgress(data);
  if(!legacy)return NextResponse.json({error:"Прогресс повреждён."},{status:500});

  if(academyProgressShadowEnabled())after(()=>compareAcademyProgressWithGo(token,legacy));
  return NextResponse.json(legacy,{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const body=await req.json().catch(()=>({}));
  const lesson=lessonBySlug(String(body?.slug||""));
  const completed=body?.completed!==false;
  const taskConfirmed=body?.taskConfirmed===true;
  const submissionNote=String(body?.submissionNote||"").trim().slice(0,1000);
  if(!lesson)return NextResponse.json({error:"Урок отсутствует."},{status:404});
  if(completed&&!taskConfirmed)return NextResponse.json({error:lesson.theoryOnly?"Подтверди, что главная мысль урока понятна.":"Сначала выполни практическое задание урока."},{status:400});

  const lessonIndex=curriculum.findIndex(item=>item.slug===lesson.slug);
  if(completed&&lessonIndex>0){
    const required=curriculum.slice(0,lessonIndex).map(item=>item.slug);
    const {data:completedRows}=await service.from("lesson_progress")
      .select("status,lessons!inner(slug)")
      .eq("user_id",user.id)
      .eq("status","completed");
    const completedSlugs=new Set((completedRows||[]).map((row:any)=>row.lessons?.slug).filter(Boolean));
    const missing=required.find(slug=>!completedSlugs.has(slug));
    if(missing)return NextResponse.json({error:"Сначала заверши предыдущий урок."},{status:409});
  }

  const {data:lessonRow,error:lessonError}=await service.from("lessons").upsert({
    slug:lesson.slug,
    title:lesson.title,
    xp_reward:lesson.xp,
    content:{module:lesson.module,track:lesson.track,software:lesson.software,level:lesson.level,minutes:lesson.minutes},
    published:true
  },{onConflict:"slug"}).select("id").single();
  if(lessonError||!lessonRow)return NextResponse.json({error:"Ошибка синхронизации урока."},{status:503});

  if(completed){
    const {error}=await service.from("lesson_progress").upsert({
      user_id:user.id,
      lesson_id:lessonRow.id,
      status:"completed",
      completed_at:new Date().toISOString(),
      submission_note:submissionNote||null
    },{onConflict:"user_id,lesson_id"});
    if(error)return NextResponse.json({error:"Ошибка сохранения прогресса."},{status:503});
  }else{
    const {error}=await service.from("lesson_progress").delete().eq("user_id",user.id).eq("lesson_id",lessonRow.id);
    if(error)return NextResponse.json({error:"Ошибка снятия отметки."},{status:503});
  }

  const {data:progress}=await service.from("lesson_progress")
    .select("status,lessons!inner(xp_reward)")
    .eq("user_id",user.id)
    .eq("status","completed");
  const xp=(progress||[]).reduce((sum:number,row:any)=>sum+Number(row.lessons?.xp_reward||0),0);
  await service.from("profiles").update({xp}).eq("id",user.id);

  return NextResponse.json({ok:true,completed,slug:lesson.slug,xp});
}
