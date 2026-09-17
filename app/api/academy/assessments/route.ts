import {NextRequest,NextResponse} from "next/server";
import {
  ACADEMY_ASSESSMENT_VERSION,
  academyAssessmentConfig,
  assessmentPublicIndex,
  assessmentStorageIndex,
  isCurrentAssessmentStorageIndex,
  savedAcademyAssessments,
} from "@/lib/academy-assessment";
import {academyLevels,academyStartLevelIndex,assessmentRequiredLessons,finalAssessmentIndex,normalizeExperienceLevel} from "@/lib/curriculum";
import {verifyAcademyReviewProof} from "@/lib/academy-review-proof";
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
  if(!tableResult.error)for(const row of tableResult.data||[]){
    const storedIndex=Number(row.module_index);
    if(isCurrentAssessmentStorageIndex(storedIndex)){
      const publicIndex=assessmentPublicIndex(storedIndex);
      results.set(publicIndex,{module_index:publicIndex,score:Number(row.score),quiz_score:Number(row.quiz_score)});
    }
  }
  const values=Array.from(results.values()).sort((a,b)=>a.module_index-b.module_index);
  return NextResponse.json({version:ACADEMY_ASSESSMENT_VERSION,passed:values.map(row=>row.module_index),results:values},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));
  const moduleIndex=Number(body.moduleIndex);
  if(!Number.isInteger(moduleIndex)||moduleIndex<0||moduleIndex>finalAssessmentIndex)return NextResponse.json({error:"Уровень аттестации не найден."},{status:404});
  const config=academyAssessmentConfig(moduleIndex);
  const answers=Array.isArray(body.answers)?body.answers.map(Number):[];
  const correct=config.questions.filter((question,index)=>answers[index]===question.correct).length;
  const quizScore=Math.round(correct/config.questions.length*100);
  const submittedReviews=Array.isArray(body.reviews)?body.reviews.slice(0,3):[];
  const verifiedReviews:{score:number;reviewId:string}[]=submittedReviews.flatMap((item:unknown)=>{
    if(!item||typeof item!=="object")return [];
    const proof=verifyAcademyReviewProof((item as Record<string,unknown>).reviewProof,{userId:user.id,purpose:"academy_assessment",moduleIndex});
    return proof?[proof]:[];
  });
  if(verifiedReviews.length!==config.requiredVideos||new Set(verifiedReviews.map(item=>item.reviewId)).size!==config.requiredVideos)return NextResponse.json({error:`Добавь ${config.requiredVideos} разных видео и дождись подтверждённого ИИ-разбора каждого.`},{status:400});
  const score=Math.round(verifiedReviews.reduce((sum,item)=>sum+item.score,0)/verifiedReviews.length);
  const selfChecks=body?.selfChecks&&typeof body.selfChecks==="object"?body.selfChecks as Record<string,unknown>:{ };
  if(!["audio","continuity","rights","export"].every(key=>selfChecks[key]===true))return NextResponse.json({error:"Подтверди ручную проверку звука, склеек, прав на материалы и готового файла."},{status:400});

  const [profileResult,completedResult,passedResult]=await Promise.all([
    service.from("profiles").select("onboarding").eq("id",user.id).maybeSingle(),
    service.from("lesson_progress").select("status,lessons!inner(slug)").eq("user_id",user.id).eq("status","completed"),
    service.from("academy_assessments").select("module_index,passed").eq("user_id",user.id).eq("passed",true),
  ]);
  if(profileResult.error||completedResult.error)return NextResponse.json({error:"Не удалось проверить прогресс обучения."},{status:503});
  const profile=profileResult.data;
  const completed=new Set((completedResult.data||[]).map((row:any)=>row.lessons?.slug).filter(Boolean));
  const level=normalizeExperienceLevel(profile?.onboarding?.level);
  const final=moduleIndex===finalAssessmentIndex;
  const startLevelIndex=academyStartLevelIndex(level);
  const requiredLessons=final
    ?academyLevels.slice(startLevelIndex).flatMap((_item,offset)=>assessmentRequiredLessons(startLevelIndex+offset,level))
    :assessmentRequiredLessons(moduleIndex,level);
  if(!requiredLessons.length)return NextResponse.json({error:"Этот уровень находится до твоей стартовой точки обучения."},{status:409});
  if(requiredLessons.some(lesson=>!completed.has(lesson.slug)))return NextResponse.json({error:final?"Сначала заверши весь обязательный маршрут.":"Сначала заверши все обязательные уроки уровня."},{status:409});

  const passed=new Set(savedAcademyAssessments(profile?.onboarding).map(item=>item.moduleIndex));
  if(!passedResult.error)for(const row of passedResult.data||[]){const stored=Number(row.module_index);if(isCurrentAssessmentStorageIndex(stored))passed.add(assessmentPublicIndex(stored))}
  for(let index=startLevelIndex;index<moduleIndex;index++)if(!passed.has(index))return NextResponse.json({error:final?"Сначала пройди аттестации всех трёх уровней.":"Сначала пройди предыдущую аттестацию."},{status:409});

  if(score<config.threshold||quizScore<config.quizThreshold)return NextResponse.json({error:`Пока нужно усилить результат: видео ${score}/${config.threshold}, тест ${quizScore}/${config.quizThreshold}. Исправь конкретные подсказки и попробуй снова.`},{status:400});
  const updatedAt=new Date().toISOString();
  const storageIndex=assessmentStorageIndex(moduleIndex);
  const tableWrite=await service.from("academy_assessments").upsert({user_id:user.id,module_index:storageIndex,module_name:String(body.moduleName||config.title).slice(0,180),score,quiz_score:quizScore,passed:true,updated_at:updatedAt},{onConflict:"user_id,module_index"});
  const saved=savedAcademyAssessments(profile?.onboarding).filter(item=>item.moduleIndex!==moduleIndex);
  saved.push({moduleIndex,score,quizScore,passed:true,updatedAt});
  const onboarding={...(profile?.onboarding&&typeof profile.onboarding==="object"?profile.onboarding:{}),academyAssessmentVersion:ACADEMY_ASSESSMENT_VERSION,academyAssessments:saved};
  const profileWrite=await service.from("profiles").update({onboarding}).eq("id",user.id);
  if(tableWrite.error&&profileWrite.error)return NextResponse.json({error:"Не удалось сохранить аттестацию."},{status:503});
  return NextResponse.json({ok:true,moduleIndex,nextModuleIndex:moduleIndex+1<academyLevels.length?moduleIndex+1:null,final,score,quizScore});
}
