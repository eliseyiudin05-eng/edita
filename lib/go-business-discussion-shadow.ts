export type BusinessDiscussionMessage={
  id:string;
  content:string;
  createdAt:string;
  author:string;
};

export type BusinessDiscussionResponse={messages:BusinessDiscussionMessage[]};

type GoReadResult=
  |{ok:true;value:BusinessDiscussionResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=256*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function businessDiscussionShadowEnabled(){
  return process.env.GO_BACKEND_BUSINESS_DISCUSSION_SHADOW_READS_ENABLED==="true"&&Boolean(endpoint());
}

export function normalizeBusinessDiscussion(value:unknown):BusinessDiscussionResponse|null{
  if(!value||typeof value!=="object")return null;
  const rows=(value as Record<string,unknown>).messages;
  if(!Array.isArray(rows)||rows.length>80)return null;
  const messages:BusinessDiscussionMessage[]=[];
  const seen=new Set<string>();
  for(const value of rows){
    if(!value||typeof value!=="object")return null;
    const row=value as Record<string,unknown>;
    if(typeof row.id!=="string"||!uuidPattern.test(row.id)||seen.has(row.id))return null;
    if(typeof row.content!=="string"||row.content.length<1||row.content.length>1400)return null;
    if(typeof row.author!=="string"||row.author.trim().length<1||row.author.length>120)return null;
    if(typeof row.createdAt!=="string"||row.createdAt.length>64||!Number.isFinite(Date.parse(row.createdAt)))return null;
    seen.add(row.id);
    messages.push({id:row.id,content:row.content,createdAt:row.createdAt,author:row.author});
  }
  return {messages};
}

export async function compareBusinessDiscussionWithGo(token:string,legacy:BusinessDiscussionResponse){
  const result=await readFromGo(token,shadowTimeout());
  const outcome=result.ok?(JSON.stringify(result.value)===JSON.stringify(legacy)?"match":"mismatch"):result.outcome;
  console.info("go_business_discussion_shadow",{route:"business_discussion",outcome,duration_ms:result.durationMs});
}

async function readFromGo(token:string,timeoutMs:number):Promise<GoReadResult>{
  const started=Date.now();
  try{
    const target=endpoint();
    if(!target)return failed("invalid_configuration",started);
    const response=await fetch(target,{method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)return failed(`http_${response.status}`,started);
    const declaredLength=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes)return failed("response_too_large",started);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>maxResponseBytes)return failed("response_too_large",started);
    const value=normalizeBusinessDiscussion(JSON.parse(raw));
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function endpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/community/business-discussion",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_BUSINESS_DISCUSSION_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function failed(outcome:string,started:number):GoReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
