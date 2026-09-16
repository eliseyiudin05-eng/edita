import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){return /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization")||"")?.[1]||""}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const {data,error}=await service.from("academy_assessments").select("module_index,score,quiz_score").eq("user_id",user.id).eq("passed",true);
  if(error)return NextResponse.json({error:"Не удалось загрузить аттестации."},{status:503});
  return NextResponse.json({passed:(data||[]).map(row=>row.module_index),results:data||[]},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});
  const body=await req.json().catch(()=>({}));
  const moduleIndex=Number(body.moduleIndex),score=Number(body.score),quizScore=Number(body.quizScore);
  const threshold=body.final?85:Math.min(85,60+moduleIndex*5);
  if(!Number.isInteger(moduleIndex)||moduleIndex<0||score<threshold||quizScore<80)return NextResponse.json({error:"Аттестация пока не пройдена."},{status:400});
  const {error}=await service.from("academy_assessments").upsert({user_id:user.id,module_index:moduleIndex,module_name:String(body.moduleName||"Ступень").slice(0,180),score,quiz_score:quizScore,passed:true,updated_at:new Date().toISOString()},{onConflict:"user_id,module_index"});
  if(error)return NextResponse.json({error:"Не удалось сохранить аттестацию."},{status:503});
  return NextResponse.json({ok:true,moduleIndex});
}
