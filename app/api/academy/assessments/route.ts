import {NextRequest,NextResponse} from "next/server";
import {academyAssessmentConfig,savedAcademyAssessments} from "@/lib/academy-assessment";
import {assessmentRequiredLessons,curriculum,curriculumModules,learningStartIndex,normalizeExperienceLevel} from "@/lib/curriculum";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){return /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization")||"")?.[1]||""}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const [tableResult,profileResult]=await Promise.all([
    service.from("academy_assessments").select("module_index,score,quiz_score").eq("user_id",user.id).eq("passed",true),
    service.from("profiles").select("onboarding").eq("id",user.id).maybeSingle(),
  ]);
  if(profileResult.error)return NextResponse.json({error:"Не удалось загрузить аттестации."},{status:503});
  const fallback=savedAcademyAssessments(profileResult.data?.onboarding);
  const results=new Map<number,{module_index:number;score:number;quiz_score:number}>();
  for(const item of fallback)results.set(item.moduleIndex,{module_index:item.moduleIndex,score:item.score,quiz_score:item.quizScore});
  if(!tableResult.error)for(const row of tableResult.data||[])results.set(Number(row.module_index),row);
  const values=Array.from(results.values()).sort((a,b)=>a.module_index-b.module_index);
  return NextResponse.json({passed:values.map(row=>row.module_index),results:values},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));
  const moduleIndex=Number(body.moduleIndex);
  if(!Number.isInteger(moduleIndex)||moduleIndex<0||moduleIndex>=curriculumModules.length)return NextResponse.json({error:"Ступень аттестации не найдена."},{status:404});
  const config=academyAssessmentConfig(moduleIndex);
  const answers=Array.isArray(body.answers)?body.answers.map(Number):[];
  const correct=config.questions.filter((question,index)=>answers[index]===question.correct).length;
  const quizScore=Math.round(correct/config.questions.length*100);
  const reviews=Array.isArray(body.reviews)?body.reviews.slice(0,3):[];
  const scores=reviews.map((item:any)=>Number(item?.overall_score)).filter((value:number)=>Number.isFinite(value)&&value>=0&&value<=100);
  const videoCount=Number(body.videoCount);
  if(videoCount!==config.requiredVideos||scores.length!==config.requiredVideos)return NextResponse.json({error:`Добавь ${config.requiredVideos} видео и дождись ИИ-проверки каждого.`},{status:400});
  const score=Math.round(scores.reduce((sum:number,value:number)=>sum+value,0)/scores.length);

  const [profileResult,completedResult,passedResult]=await Promise.all([
    service.from("profiles").select("onboarding").eq("id",user.id).maybeSingle(),
    service.from("lesson_progress").select("status,lessons!inner(slug)").eq("user_id",user.id).eq("status","completed"),
    service.from("academy_assessments").select("module_index,passed").eq("user_id",user.id).eq("passed",true),
  ]);
  if(profileResult.error||completedResult.error)return NextResponse.json({error:"Не удалось проверить прогресс обучения."},{status:503});
  const profile=profileResult.data;
  const completedRows=completedResult.data;
  const passedRows=passedResult.data;
  const completed=new Set((completedRows||[]).map((row:any)=>row.lessons?.slug).filter(Boolean));
  const level=normalizeExperienceLevel(profile?.onboarding?.level);
  const moduleLessons=assessmentRequiredLessons(moduleIndex,level);
  if(!moduleLessons.length)return NextResponse.json({error:"Эта ступень находится до твоей стартовой точки обучения."},{status:409});
  if(moduleLessons.some(lesson=>!completed.has(lesson.slug)))return NextResponse.json({error:"Сначала заверши все уроки этой ступени."},{status:409});
  const startIndex=learningStartIndex(level);
  const startModuleIndex=Math.max(0,curriculumModules.findIndex(group=>group.lessons.some(lesson=>lesson.slug===curriculum[startIndex]?.slug)));
  if(level!=="pro"&&moduleIndex>startModuleIndex){
    const passed=new Set(savedAcademyAssessments(profile?.onboarding).map(item=>item.moduleIndex));
    if(!passedResult.error)for(const row of passedRows||[])passed.add(Number(row.module_index));
    for(let index=startModuleIndex;index<moduleIndex;index++)if(!passed.has(index))return NextResponse.json({error:"Сначала пройди предыдущую аттестацию."},{status:409});
  }
  if(score<config.threshold||quizScore<config.quizThreshold)return NextResponse.json({error:`Пока нужно усилить результат: видео ${score}/${config.threshold}, тест ${quizScore}/${config.quizThreshold}. Исправь подсказки ИИ и попробуй снова.`},{status:400});
  const updatedAt=new Date().toISOString();
  const tableWrite=await service.from("academy_assessments").upsert({user_id:user.id,module_index:moduleIndex,module_name:String(body.moduleName||"Ступень").slice(0,180),score,quiz_score:quizScore,passed:true,updated_at:updatedAt},{onConflict:"user_id,module_index"});
  const saved=savedAcademyAssessments(profile?.onboarding).filter(item=>item.moduleIndex!==moduleIndex);
  saved.push({moduleIndex,score,quizScore,passed:true,updatedAt});
  const onboarding={...(profile?.onboarding&&typeof profile.onboarding==="object"?profile.onboarding:{}),academyAssessments:saved};
  const profileWrite=await service.from("profiles").update({onboarding}).eq("id",user.id);
  if(tableWrite.error&&profileWrite.error)return NextResponse.json({error:"Не удалось сохранить аттестацию."},{status:503});
  return NextResponse.json({ok:true,moduleIndex,nextModuleIndex:moduleIndex+1<curriculumModules.length?moduleIndex+1:null,score,quizScore});
}
