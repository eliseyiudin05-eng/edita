import {after,NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {getOrCreateConversation,normalizeAiScope,readConversationMessages} from "@/lib/ai-history";
import {aiHistoryShadowEnabled,compareAiHistoryWithGo,normalizeAiHistory} from "@/lib/go-ai-history-shadow";
import {aiHistoryCanaryEnabled,recordAiHistoryCanaryComparison,tryAiHistoryCanary} from "@/lib/go-ai-history-canary";

function bearer(req:NextRequest){
  const value=req.headers.get("authorization");
  return value?.startsWith("Bearer ")?value.slice(7):null;
}

async function readLegacyAiHistory(service:NonNullable<ReturnType<typeof getSupabaseServiceClient>>,userId:string,scope:string,title:string){
  const lessonSlug=scope.startsWith("lesson:")?scope.slice(7):null;
  const conversation=await getOrCreateConversation(service,userId,scope,title,lessonSlug);
  const messages=await readConversationMessages(service,userId,conversation.id);
  return normalizeAiHistory({conversation,messages},scope);
}

export async function GET(req:NextRequest){
  const token=bearer(req);
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  if(!user||!service||!token)return NextResponse.json({error:"Нужен вход."},{status:401});

  try{
    const scope=normalizeAiScope(req.nextUrl.searchParams.get("scope"));
    const title=String(req.nextUrl.searchParams.get("title")||"Помощник KIVRONIX").slice(0,120);
    const canary=await tryAiHistoryCanary(token,scope);
    if(canary.attempted&&canary.value){
      after(async()=>{
        try{
          recordAiHistoryCanaryComparison(canary.value!,await readLegacyAiHistory(service,user.id,scope,title));
        }catch{
          recordAiHistoryCanaryComparison(canary.value!,null);
        }
      });
      return NextResponse.json(canary.value,{headers:{"Cache-Control":"no-store"}});
    }

    const history=await readLegacyAiHistory(service,user.id,scope,title);
    if(!history)return NextResponse.json({error:"История пока недоступна."},{status:503});
    if(!aiHistoryCanaryEnabled()&&aiHistoryShadowEnabled())after(()=>compareAiHistoryWithGo(token,scope,history));
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
