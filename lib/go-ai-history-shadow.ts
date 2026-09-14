export type AiHistoryConversation={
  id:string;
  scope_key:string;
  title:string;
  lesson_slug:string|null;
  updated_at:string;
};

type AiHistoryMessage={id:string;from:"user"|"ai";text:string;createdAt:string};

export type AiHistory={
  conversation:AiHistoryConversation;
  messages:AiHistoryMessage[];
};

type NormalizedAiHistory=AiHistory;
type GoAIHistoryResult=
  |{ok:true;value:NormalizedAiHistory;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=2*1024*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const scopePattern=/^[a-z0-9:_-]{1,100}$/;

export function aiHistoryShadowEnabled(){
  return process.env.GO_BACKEND_AI_HISTORY_SHADOW_READS_ENABLED==="true"&&Boolean(goAiHistoryEndpoint("main"));
}

export function goAiHistoryBackendConfigured(){return Boolean(goAiHistoryEndpoint("main"))}

export function normalizeAiHistory(value:unknown,expectedScope:string):NormalizedAiHistory|null{
  if(!value||typeof value!=="object"||!scopePattern.test(expectedScope))return null;
  const row=value as Record<string,unknown>;
  const conversation=parseConversation(row.conversation,expectedScope);
  if(!conversation||!Array.isArray(row.messages)||row.messages.length>80)return null;
  const messages:AiHistoryMessage[]=[];
  const ids=new Set<string>();
  for(const value of row.messages){
    const message=parseMessage(value);
    if(!message||ids.has(message.id))return null;
    ids.add(message.id);
    messages.push(message);
  }
  return {conversation,messages};
}

export async function compareAiHistoryWithGo(token:string,scope:string,legacy:NormalizedAiHistory){
  const result=await readAiHistoryFromGo(token,scope,shadowTimeout());
  const outcome=result.ok?(sameAiHistory(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_ai_history_shadow",{route:"ai_history",outcome,duration_ms:result.durationMs});
}

export function sameAiHistory(left:AiHistory,right:AiHistory){return JSON.stringify(left)===JSON.stringify(right)}

export async function readAiHistoryFromGo(token:string,scope:string,timeoutMs:number):Promise<GoAIHistoryResult>{
  const started=Date.now();
  try{
    const endpoint=goAiHistoryEndpoint(scope);
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
    const value=normalizeAiHistory(JSON.parse(raw),scope);
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseConversation(value:unknown,expectedScope:string):AiHistoryConversation|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  const id=uuid(row.id),lessonSlug=optionalString(row.lesson_slug,120);
  if(!id||row.scope_key!==expectedScope||!validString(row.title,1,120)||lessonSlug===undefined||!validTime(row.updated_at))return null;
  return {id,scope_key:expectedScope,title:row.title as string,lesson_slug:lessonSlug,updated_at:row.updated_at as string};
}

function parseMessage(value:unknown):AiHistoryMessage|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  const id=uuid(row.id);
  if(!id||row.from!=="user"&&row.from!=="ai"||!validString(row.text,1,12000)||!validTime(row.createdAt))return null;
  return {id,from:row.from,text:row.text as string,createdAt:row.createdAt as string};
}

export function goAiHistoryEndpoint(scope:string){
  try{
    if(!scopePattern.test(scope))return null;
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    const endpoint=new URL("/v1/ai/history",base);
    endpoint.searchParams.set("scope",scope);
    return endpoint.toString();
  }catch{return null;}
}

function uuid(value:unknown){return typeof value==="string"&&uuidPattern.test(value.toLowerCase())?value.toLowerCase():null}
function validString(value:unknown,minimum:number,maximum:number){return typeof value==="string"&&Array.from(value).length>=minimum&&Array.from(value).length<=maximum}
function optionalString(value:unknown,maximum:number){return value===null?null:typeof value==="string"&&Array.from(value).length>=1&&Array.from(value).length<=maximum?value:undefined}
function validTime(value:unknown){return typeof value==="string"&&value.length<=64&&Number.isFinite(Date.parse(value))}
function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_AI_HISTORY_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}
function failed(outcome:string,started:number):GoAIHistoryResult{return {ok:false,outcome,durationMs:Date.now()-started}}
