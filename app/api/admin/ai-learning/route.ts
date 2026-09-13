import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function bearer(req:NextRequest){const value=req.headers.get("authorization");return value?.startsWith("Bearer ")?value.slice(7):null}
async function getAdmin(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  return profile?.role==="admin"?{user,service}:null;
}

export async function GET(req:NextRequest){
  const admin=await getAdmin(req);
  if(!admin)return NextResponse.json({error:"Нет доступа."},{status:403});
  const [{data:candidates,error},{data:knowledge}]=await Promise.all([
    admin.service.from("ai_knowledge_candidates").select("id,topic,content,status,created_at,reviewed_at").order("created_at",{ascending:false}).limit(100),
    admin.service.from("ai_knowledge").select("id,candidate_id,topic,content,version,published,created_at,updated_at").order("updated_at",{ascending:false}).limit(100)
  ]);
  if(error)return NextResponse.json({error:"Очередь улучшений пока недоступна."},{status:500});
  return NextResponse.json({candidates:candidates||[],knowledge:knowledge||[]});
}

export async function POST(req:NextRequest){
  const admin=await getAdmin(req);
  if(!admin)return NextResponse.json({error:"Нет доступа."},{status:403});
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");
  const id=String(body?.id||"");

  if(action==="reject"){
    const {error}=await admin.service.from("ai_knowledge_candidates").update({status:"rejected",reviewed_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
    return error?NextResponse.json({error:"Не удалось отклонить материал."},{status:500}):NextResponse.json({ok:true});
  }
  if(action==="unpublish"){
    const {error}=await admin.service.from("ai_knowledge").update({published:false,updated_at:new Date().toISOString()}).eq("id",id);
    return error?NextResponse.json({error:"Не удалось снять материал с публикации."},{status:500}):NextResponse.json({ok:true});
  }
  if(action!=="approve")return NextResponse.json({error:"Неизвестное действие."},{status:400});

  const {data:candidate}=await admin.service.from("ai_knowledge_candidates").select("id,topic,content,status").eq("id",id).maybeSingle();
  if(!candidate||candidate.status!=="pending")return NextResponse.json({error:"Материал уже обработан или отсутствует."},{status:409});
  const topic=String(body?.topic||candidate.topic).trim().slice(0,120);
  const content=String(body?.content||candidate.content).trim().slice(0,12000);
  if(topic.length<2||content.length<20)return NextResponse.json({error:"Материал слишком короткий."},{status:400});

  const {data:existing}=await admin.service.from("ai_knowledge").select("id,version").eq("candidate_id",candidate.id).maybeSingle();
  const payload={candidate_id:candidate.id,topic,content,version:Number(existing?.version||0)+1,published:true,updated_at:new Date().toISOString()};
  const result=existing?.id
    ?await admin.service.from("ai_knowledge").update(payload).eq("id",existing.id)
    :await admin.service.from("ai_knowledge").insert(payload);
  if(result.error)return NextResponse.json({error:"Не удалось опубликовать материал."},{status:500});
  await admin.service.from("ai_knowledge_candidates").update({status:"approved",reviewed_at:new Date().toISOString()}).eq("id",candidate.id);
  return NextResponse.json({ok:true,published:true});
}
