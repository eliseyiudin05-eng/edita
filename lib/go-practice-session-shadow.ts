export type PracticeMessage={from:"client"|"user";text:string};
export type PracticeResult={
  client_reply:string;
  score:number;
  feedback:string;
  better_answer?:string;
  coach_hint?:string;
  deal_status?:"ongoing"|"won"|"lost";
  deal_reason?:string;
  scenario_meta?:Record<string,unknown>|null;
};
export type StoredPracticeSession={scenario:string;messages:PracticeMessage[];result:PracticeResult|null;updated_at:string};
export type PracticeSessionResponse={session:StoredPracticeSession|null};

export type GoPracticeSessionReadResult=
  |{ok:true;value:PracticeSessionResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=256*1024;

export function practiceSessionShadowEnabled(){
  return process.env.GO_BACKEND_PRACTICE_SHADOW_READS_ENABLED==="true"&&goPracticeSessionBackendConfigured();
}

export function goPracticeSessionBackendConfigured(){return Boolean(endpoint())}

export function normalizePracticeSessionResponse(value:unknown):PracticeSessionResponse|null{
  if(value==null)return {session:null};
  if(typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  if(typeof row.scenario!=="string"||Array.from(row.scenario).length>2000||!Array.isArray(row.messages)||row.messages.length>50)return null;
  const messages:PracticeMessage[]=[];
  for(const item of row.messages){
    if(!item||typeof item!=="object"||Array.isArray(item))return null;
    const message=item as Record<string,unknown>;
    if((message.from!=="client"&&message.from!=="user")||typeof message.text!=="string"||!message.text.trim()||Array.from(message.text).length>2000)return null;
    messages.push({from:message.from,text:message.text});
  }
  let result:PracticeResult|null=null;
  if(row.result!=null){
    if(typeof row.result!=="object"||Array.isArray(row.result))return null;
    const candidate=row.result as Record<string,unknown>;
    if(typeof candidate.client_reply!=="string"||Array.from(candidate.client_reply).length>2000||
      typeof candidate.score!=="number"||!Number.isFinite(candidate.score)||candidate.score<0||candidate.score>100||
      typeof candidate.feedback!=="string"||Array.from(candidate.feedback).length>3000||
      (candidate.better_answer!=null&&(typeof candidate.better_answer!=="string"||Array.from(candidate.better_answer).length>3000))||
      (candidate.coach_hint!=null&&(typeof candidate.coach_hint!=="string"||Array.from(candidate.coach_hint).length>3000))||
      (candidate.deal_reason!=null&&(typeof candidate.deal_reason!=="string"||Array.from(candidate.deal_reason).length>2000))||
      (candidate.deal_status!=null&&!(["ongoing","won","lost"] as unknown[]).includes(candidate.deal_status)))return null;
    result={
      client_reply:candidate.client_reply,
      score:candidate.score,
      feedback:candidate.feedback,
      ...(typeof candidate.better_answer==="string"?{better_answer:candidate.better_answer}:{}),
      ...(typeof candidate.coach_hint==="string"?{coach_hint:candidate.coach_hint}:{}),
      ...(typeof candidate.deal_status==="string"?{deal_status:candidate.deal_status as "ongoing"|"won"|"lost"}:{}),
      ...(typeof candidate.deal_reason==="string"?{deal_reason:candidate.deal_reason}:{}),
      ...(candidate.scenario_meta&&typeof candidate.scenario_meta==="object"&&!Array.isArray(candidate.scenario_meta)?{scenario_meta:candidate.scenario_meta as Record<string,unknown>}:{})
    };
  }
  if(typeof row.updated_at!=="string"||!row.updated_at||!Number.isFinite(Date.parse(row.updated_at)))return null;
  return {session:{scenario:row.scenario,messages,result,updated_at:row.updated_at}};
}

export async function comparePracticeSessionWithGo(token:string,legacy:PracticeSessionResponse){
  const result=await readPracticeSessionFromGo(token,shadowTimeout());
  const outcome=result.ok?(samePracticeSession(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_practice_shadow",{route:"practice_session",outcome,duration_ms:result.durationMs});
}

export async function readPracticeSessionFromGo(token:string,timeoutMs:number):Promise<GoPracticeSessionReadResult>{
  const started=Date.now();
  try{
    const target=endpoint();
    if(!target)return failed("invalid_configuration",started);
    const response=await fetch(target,{method:"GET",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)return failed(`http_${response.status}`,started);
    const declared=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declared)&&declared>maxResponseBytes)return failed("response_too_large",started);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>maxResponseBytes)return failed("response_too_large",started);
    const parsed=JSON.parse(raw) as unknown;
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)||!("session" in parsed))return failed("invalid_response",started);
    const value=normalizePracticeSessionResponse((parsed as {session?:unknown}).session);
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){return failed(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable",started)}
}

export function samePracticeSession(left:PracticeSessionResponse,right:PracticeSessionResponse){return JSON.stringify(left)===JSON.stringify(right)}
function failed(outcome:string,started:number):GoPracticeSessionReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
function shadowTimeout(){const value=Number(process.env.GO_BACKEND_PRACTICE_SHADOW_TIMEOUT_MS||"1000");return Number.isInteger(value)&&value>=250&&value<=3000?value:1000}
function endpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/practice/session",base).toString();
  }catch{return null;}
}
