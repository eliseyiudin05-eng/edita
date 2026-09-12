import type {SupabaseClient} from "@supabase/supabase-js";

export type AiChatMessage={id?:string;from:"user"|"ai";text:string;createdAt?:string};

export function normalizeAiScope(value:unknown){
  const scope=String(value||"main").trim().toLowerCase().replace(/[^a-z0-9:_-]/g,"-").slice(0,100);
  return scope||"main";
}

export async function getOrCreateConversation(
  service:SupabaseClient,
  userId:string,
  scopeKey:string,
  title:string,
  lessonSlug?:string|null
){
  const scope=normalizeAiScope(scopeKey);
  const {data:existing}=await service.from("ai_conversations")
    .select("id,scope_key,title,lesson_slug,updated_at")
    .eq("user_id",userId)
    .eq("scope_key",scope)
    .maybeSingle();
  if(existing)return existing;

  const {data,error}=await service.from("ai_conversations").insert({
    user_id:userId,
    scope_key:scope,
    title:String(title||"Помощник EDITA").slice(0,120),
    lesson_slug:lessonSlug?String(lessonSlug).slice(0,120):null
  }).select("id,scope_key,title,lesson_slug,updated_at").single();
  if(error)throw error;
  return data;
}

export async function readConversationMessages(service:SupabaseClient,userId:string,conversationId:string,limit=80){
  const {data,error}=await service.from("ai_messages")
    .select("id,role,content,created_at")
    .eq("conversation_id",conversationId)
    .eq("user_id",userId)
    .order("created_at",{ascending:true})
    .limit(Math.max(1,Math.min(limit,120)));
  if(error)throw error;
  return (data||[]).map((row:any)=>({
    id:row.id,
    from:row.role==="assistant"?"ai":"user",
    text:row.content,
    createdAt:row.created_at
  })) as AiChatMessage[];
}

export async function saveConversationMessage(
  service:SupabaseClient,
  userId:string,
  conversationId:string,
  role:"user"|"assistant",
  content:string,
  metadata:Record<string,unknown>={}
){
  const safeContent=String(content).trim().slice(0,12000);
  if(!safeContent)return;
  const {error}=await service.from("ai_messages").insert({
    conversation_id:conversationId,
    user_id:userId,
    role,
    content:safeContent,
    metadata
  });
  if(error)throw error;
  await service.from("ai_conversations").update({updated_at:new Date().toISOString()}).eq("id",conversationId).eq("user_id",userId);
}
