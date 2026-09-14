export type GuardianVerificationResponse={
  needed:boolean;
  verified:boolean;
  request:{status:string;review_note:string|null}|null;
};

type GoReadResult=
  |{ok:true;value:GuardianVerificationResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=32*1024;
const statusPattern=/^[a-z][a-z0-9_]{0,31}$/;

export function guardianVerificationShadowEnabled(){
  return process.env.GO_BACKEND_GUARDIAN_VERIFICATION_SHADOW_READS_ENABLED==="true"&&Boolean(endpoint());
}

export function goGuardianVerificationBackendConfigured(){return Boolean(endpoint())}

export function normalizeGuardianVerification(value:unknown):GuardianVerificationResponse|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.needed!=="boolean"||typeof row.verified!=="boolean")return null;
  const request=row.request===null?null:parseRequest(row.request);
  if(row.request!==null&&!request)return null;
  return {needed:row.needed,verified:row.verified,request};
}

export async function compareGuardianVerificationWithGo(token:string,legacy:GuardianVerificationResponse){
  const result=await readGuardianVerificationFromGo(token,shadowTimeout());
  const outcome=result.ok?(sameGuardianVerification(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_guardian_verification_shadow",{route:"guardian_verification",outcome,duration_ms:result.durationMs});
}

export function sameGuardianVerification(left:GuardianVerificationResponse,right:GuardianVerificationResponse){
  return JSON.stringify(left)===JSON.stringify(right);
}

export async function readGuardianVerificationFromGo(token:string,timeoutMs:number):Promise<GoReadResult>{
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
    const value=normalizeGuardianVerification(JSON.parse(raw));
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseRequest(value:unknown){
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.status!=="string"||!statusPattern.test(row.status)||!(row.review_note===null||typeof row.review_note==="string"&&row.review_note.length<=1200))return null;
  return {status:row.status,review_note:row.review_note as string|null};
}

function endpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/guardian/verification",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_GUARDIAN_VERIFICATION_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function failed(outcome:string,started:number):GoReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
