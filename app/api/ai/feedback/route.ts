import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {tryAIFeedbackCanary} from "@/lib/go-ai-feedback-canary";

function bearer(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

export async function POST(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  if(!user||!service||!token)return NextResponse.json({error:"Нужен вход в KIVRONIX."},{status:401});

  const body=await req.json().catch(()=>({}));
  const messageId=String(body?.messageId||"");
  const helpful=body?.helpful;
  const comment=String(body?.comment||"").trim().slice(0,1000);
  if(!/^[0-9a-f-]{36}$/i.test(messageId)||typeof helpful!=="boolean"){
    return NextResponse.json({error:"Оценка заполнена неверно."},{status:400});
  }

  const canary=await tryAIFeedbackCanary(token,messageId,helpful,comment);
  if(canary)return NextResponse.json(canary,{headers:{"Cache-Control":"no-store"}});

  const {data:message}=await service.from("ai_messages")
    .select("id,conversation_id,content,role,created_at")
    .eq("id",messageId)
    .eq("user_id",user.id)
    .maybeSingle();
  if(!message||message.role!=="assistant")return NextResponse.json({error:"Ответ помощника отсутствует."},{status:404});

  const {data:feedback,error}=await service.from("ai_feedback").upsert({
    user_id:user.id,
    message_id:message.id,
    helpful,
    comment:comment||null
  },{onConflict:"user_id,message_id"}).select("id").single();
  if(error||!feedback)return NextResponse.json({error:"Оценка пока не сохранилась."},{status:500});

  let queued=false;
  if(comment.length>=20){
    const {data:previous}=await service.from("ai_messages")
      .select("content")
      .eq("conversation_id",message.conversation_id)
      .eq("user_id",user.id)
      .eq("role","user")
      .lt("created_at",message.created_at)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    const candidate=[
      "Вопрос пользователя:\n"+String(previous?.content||"Вопрос отсутствует").slice(0,3500),
      "Ответ помощника:\n"+String(message.content||"").slice(0,6500),
      "Что нужно улучшить:\n"+comment
    ].join("\n\n");
    const {error:candidateError}=await service.from("ai_knowledge_candidates").insert({
      source_feedback_id:feedback.id,
      topic:helpful?"Подтверждённый полезный ответ":"Улучшение ответа помощника",
      content:candidate,
      status:"pending"
    });
    queued=!candidateError||String(candidateError?.message||"").toLowerCase().includes("duplicate");
  }

  return NextResponse.json({ok:true,queued});
}
