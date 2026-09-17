import {after,NextRequest,NextResponse} from "next/server";
import {lessonAccess,lessonBySlug,normalizeExperienceLevel} from "@/lib/curriculum";
import {assessmentPublicIndex,isCurrentAssessmentStorageIndex,savedAcademyAssessments} from "@/lib/academy-assessment";
import {lessonCompletionRules,lessonQuiz} from "@/lib/academy-teaching";
import {verifyAcademyReviewProof} from "@/lib/academy-review-proof";
import {academyProgressShadowEnabled,compareAcademyProgressWithGo,normalizeAcademyProgress} from "@/lib/go-academy-shadow";
import {academyProgressCanaryEnabled,recordAcademyProgressCanaryComparison,tryAcademyProgressCanary} from "@/lib/go-academy-canary";
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

  const canary=await tryAcademyProgressCanary(token);
  if(canary.attempted&&canary.value){
    after(async()=>{
      try{
        const {data,error}=await getLessonProgress(token,user.id);
        const legacy=!error?normalizeAcademyProgress(data):null;
        recordAcademyProgressCanaryComparison(canary.value!,legacy);
      }catch{
        recordAcademyProgressCanaryComparison(canary.value!,null);
      }
    });
    return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}});
  }

  const {data,error}=await getLessonProgress(token,user.id);
  if(error)return NextResponse.json({error:"Не удалось загрузить прогресс."},{status:503});
  const legacy=normalizeAcademyProgress(data);
  if(!legacy)return NextResponse.json({error:"Прогресс повреждён."},{status:500});

  if(!academyProgressCanaryEnabled()&&academyProgressShadowEnabled())after(()=>compareAcademyProgressWithGo(token,legacy));
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
  if(completed){
    const rules=lessonCompletionRules(lesson);
    const quiz=lessonQuiz(lesson);
    const quizAnswers=Array.isArray(body?.quizAnswers)?body.quizAnswers.map(Number):[];
    const quizCorrect=quiz.filter((question,index)=>quizAnswers[index]===question.correct).length;
    if(quizAnswers.length!==quiz.length||quizCorrect<rules.quizRequired)return NextResponse.json({error:`Пройди мини-тест: нужно минимум ${rules.quizRequired} правильных ответа из ${quiz.length}.`},{status:400});
    if(submissionNote.length<rules.noteMinimum)return NextResponse.json({error:`Опиши результат своими словами — минимум ${rules.noteMinimum} символов.`},{status:400});
    if(rules.videoRequired){
      const proof=verifyAcademyReviewProof(body?.reviewProof,{userId:user.id,purpose:"lesson",lessonSlug:lesson.slug});
      if(!proof||proof.score<rules.reviewMinimum)return NextResponse.json({error:`Добавь видео и получи подтверждённый ИИ-разбор не ниже ${rules.reviewMinimum}/100.`},{status:400});
    }
  }

  if(completed){
    const [{data:profile},{data:completedRows},assessmentResult]=await Promise.all([
      service.from("profiles").select("onboarding").eq("id",user.id).maybeSingle(),
      service.from("lesson_progress").select("status,lessons!inner(slug)").eq("user_id",user.id).eq("status","completed"),
      service.from("academy_assessments").select("module_index,passed").eq("user_id",user.id).eq("passed",true),
    ]);
    const completedSlugs=new Set((completedRows||[]).map((row:any)=>row.lessons?.slug).filter(Boolean));
    if(completedSlugs.has(lesson.slug))return NextResponse.json({ok:true,completed:true,slug:lesson.slug,alreadyCompleted:true});
    const level=normalizeExperienceLevel(profile?.onboarding?.level);
    const passed=new Set(savedAcademyAssessments(profile?.onboarding).map(item=>item.moduleIndex));
    if(!assessmentResult.error)for(const row of assessmentResult.data||[]){const stored=Number(row.module_index);if(isCurrentAssessmentStorageIndex(stored))passed.add(assessmentPublicIndex(stored))}
    const access=lessonAccess(lesson.slug,Array.from(completedSlugs),Array.from(passed),level);
    if(!access.unlocked)return NextResponse.json({error:access.reason==="assessment"?"Сначала пройди аттестацию предыдущего уровня.":"Сначала заверши предыдущий урок."},{status:409});
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
