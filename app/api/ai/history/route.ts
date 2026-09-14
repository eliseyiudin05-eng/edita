import {after,NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {getOrCreateConversation,normalizeAiScope,readConversationMessages} from "@/lib/ai-history";
import {aiHistoryShadowEnabled,compareAiHistoryWithGo,normalizeAiHistory} from "@/lib/go-ai-history-shadow";

function bearer(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

export async function GET(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  if(!user||!service||!token)return NextResponse.json({error:"Нужен вход."},{status:401});

  try{
    const scope=normalizeAiScope(req.nextUrl.searchParams.get("scope"));
    const title=String(req.nextUrl.searchParams.get("title")||"Помощник KIVRONIX").slice(0,120);
    const lessonSlug=scope.startsWith("lesson:")?scope.slice(7):null;
    const conversation=await getOrCreateConversation(service,user.id,scope,title,lessonSlug);
    const messages=await readConversationMessages(service,user.id,conversation.id);
    const history=normalizeAiHistory({conversation,messages},scope);
    if(!history)return NextResponse.json({error:"История пока недоступна."},{status:503});
    if(aiHistoryShadowEnabled())after(()=>compareAiHistoryWithGo(token,scope,history));
    return NextResponse.json(history,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("AI history load error",error);
    return NextResponse.json({error:"История пока недоступна."},{status:503});
  }
}

export async function DELETE(req:NextRequest){
  const user=await getUserFromAccessToken(bearer(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});

  try{
    const scope=normalizeAiScope(req.nextUrl.searchParams.get("scope"));
    const {data:conversation}=await service.from("ai_conversations")
      .select("id")
      .eq("user_id",user.id)
      .eq("scope_key",scope)
      .maybeSingle();
    if(conversation?.id){
      await service.from("ai_messages").delete().eq("conversation_id",conversation.id).eq("user_id",user.id);
    }
    return NextResponse.json({ok:true});
  }catch(error){
    console.error("AI history clear error",error);
    return NextResponse.json({error:"Ошибка очистки истории."},{status:500});
  }
}
