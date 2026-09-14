export type PrivateChatConversation={
  id:string;
  editor_id:string;
  business_owner_id:string;
  status:"active"|"closed";
  company_name:string;
  title:string;
  source_kind:"campaign"|"challenge"|"job"|"kivronix_contest";
};

export type PrivateChatMessage={
  id:string;
  conversation_id:string;
  sender_id:string;
  body:string;
  created_at:string;
};

export type PrivateChatThread={
  viewerId:string;
  conversation:PrivateChatConversation;
  messages:PrivateChatMessage[];
};

type GoPrivateChatReadResult=
  |{ok:true;value:PrivateChatThread;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=256*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sourceKinds=new Set(["campaign","challenge","job","kivronix_contest"]);

export function privateChatShadowEnabled(){
  return process.env.GO_BACKEND_PRIVATE_CHAT_SHADOW_READS_ENABLED==="true"&&Boolean(threadEndpoint("00000000-0000-4000-8000-000000000000"));
}

export function normalizePrivateChatThread(value:unknown):PrivateChatThread|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  const viewerId=uuid(row.viewerId);
  const conversation=parseConversation(row.conversation);
  if(!viewerId||!conversation||!Array.isArray(row.messages)||row.messages.length>200)return null;
  if(viewerId!==conversation.editor_id&&viewerId!==conversation.business_owner_id)return null;
  const messages:PrivateChatMessage[]=[];
  for(const value of row.messages){
    const message=parseMessage(value,conversation);
    if(!message)return null;
    messages.push(message);
  }
  return {viewerId,conversation,messages};
}

export async function comparePrivateChatThreadWithGo(token:string,conversationId:string,legacy:PrivateChatThread){
  const result=await readPrivateChatThreadFromGo(token,conversationId,shadowTimeout());
  const outcome=result.ok?(JSON.stringify(result.value)===JSON.stringify(legacy)?"match":"mismatch"):result.outcome;
  console.info("go_private_chat_shadow",{route:"private_chat_thread",outcome,duration_ms:result.durationMs});
}

async function readPrivateChatThreadFromGo(token:string,conversationId:string,timeoutMs:number):Promise<GoPrivateChatReadResult>{
  const started=Date.now();
  try{
    const endpoint=threadEndpoint(conversationId);
    if(!endpoint)return failed("invalid_configuration",started);
    const response=await fetch(endpoint,{
      method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store",redirect:"error",
      signal:AbortSignal.timeout(timeoutMs),
    });
    if(!response.ok)return failed(`http_${response.status}`,started);
    const declaredLength=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes)return failed("response_too_large",started);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>maxResponseBytes)return failed("response_too_large",started);
    const value=normalizePrivateChatThread(JSON.parse(raw));
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseConversation(value:unknown):PrivateChatConversation|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  const id=uuid(row.id),editorId=uuid(row.editor_id),ownerId=uuid(row.business_owner_id);
  if(!id||!editorId||!ownerId||editorId===ownerId||!validString(row.company_name,1,160)||!validString(row.title,1,180))return null;
  if(row.status!=="active"&&row.status!=="closed"||typeof row.source_kind!=="string"||!sourceKinds.has(row.source_kind))return null;
  return {id,editor_id:editorId,business_owner_id:ownerId,status:row.status,company_name:row.company_name as string,title:row.title as string,source_kind:row.source_kind as PrivateChatConversation["source_kind"]};
}

function parseMessage(value:unknown,conversation:PrivateChatConversation):PrivateChatMessage|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  const id=uuid(row.id),conversationId=uuid(row.conversation_id),senderId=uuid(row.sender_id);
  if(!id||conversationId!==conversation.id||!senderId||senderId!==conversation.editor_id&&senderId!==conversation.business_owner_id)return null;
  if(!validString(row.body,1,1500)||!validTime(row.created_at))return null;
  return {id,conversation_id:conversationId,sender_id:senderId,body:row.body as string,created_at:row.created_at as string};
}

function threadEndpoint(conversationId:string){
  try{
    if(!uuid(conversationId))return null;
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    const endpoint=new URL("/v1/private-chats/thread",base);
    endpoint.searchParams.set("conversationId",conversationId);
    return endpoint.toString();
  }catch{return null;}
}

function uuid(value:unknown){return typeof value==="string"&&uuidPattern.test(value.toLowerCase())?value.toLowerCase():null}
function validString(value:unknown,minimum:number,maximum:number){return typeof value==="string"&&value.length>=minimum&&value.length<=maximum}
function validTime(value:unknown){return typeof value==="string"&&value.length<=64&&Number.isFinite(Date.parse(value))}
function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_PRIVATE_CHAT_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}
function failed(outcome:string,started:number):GoPrivateChatReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
