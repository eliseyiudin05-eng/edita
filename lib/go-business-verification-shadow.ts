export type BusinessVerificationProfile={
  name:string;
  verified:boolean;
  verification_status:string;
  verification_level:string;
  verification_note:string|null;
  verified_at:string|null;
};

export type BusinessVerificationRequest={
  requested_level:string;
  status:string;
  review_note:string|null;
  created_at:string;
};

export type BusinessVerificationResponse={
  business:BusinessVerificationProfile;
  request:BusinessVerificationRequest|null;
};

type GoBusinessReadResult=
  |{ok:true;value:BusinessVerificationResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=32*1024;
const statusPattern=/^[a-z][a-z0-9_]{0,31}$/;

export function businessVerificationShadowEnabled(){
  return process.env.GO_BACKEND_BUSINESS_VERIFICATION_SHADOW_READS_ENABLED==="true"&&Boolean(verificationEndpoint());
}

export function goBusinessVerificationBackendConfigured(){return Boolean(verificationEndpoint())}

export function normalizeBusinessVerification(value:unknown):BusinessVerificationResponse|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  const business=parseBusiness(row.business);
  const request=row.request===null?null:parseRequest(row.request);
  if(!business||row.request!==null&&!request)return null;
  return {business,request};
}

export async function compareBusinessVerificationWithGo(token:string,legacy:BusinessVerificationResponse){
  const result=await readBusinessVerificationFromGo(token,shadowTimeout());
  const outcome=result.ok?(sameBusinessVerification(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_business_verification_shadow",{route:"business_verification",outcome,duration_ms:result.durationMs});
}

export function sameBusinessVerification(left:BusinessVerificationResponse,right:BusinessVerificationResponse){
  return JSON.stringify(left)===JSON.stringify(right);
}

export async function readBusinessVerificationFromGo(token:string,timeoutMs:number):Promise<GoBusinessReadResult>{
  const started=Date.now();
  try{
    const endpoint=verificationEndpoint();
    if(!endpoint)return failed("invalid_configuration",started);
    const response=await fetch(endpoint,{
      method:"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
      cache:"no-store",
      redirect:"error",
      signal:AbortSignal.timeout(timeoutMs),
    });
    if(!response.ok)return failed(`http_${response.status}`,started);
    const declaredLength=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes)return failed("response_too_large",started);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>maxResponseBytes)return failed("response_too_large",started);
    const value=normalizeBusinessVerification(JSON.parse(raw));
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseBusiness(value:unknown):BusinessVerificationProfile|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.name!=="string"||row.name.length<1||row.name.length>180)return null;
  if(typeof row.verified!=="boolean")return null;
  const verificationStatus=statusOrDefault(row.verification_status);
  const verificationLevel=statusOrDefault(row.verification_level);
  if(!verificationStatus||!verificationLevel)return null;
  if(!optionalString(row.verification_note,1000)||!optionalTime(row.verified_at))return null;
  return {
    name:row.name,verified:row.verified,verification_status:verificationStatus,
    verification_level:verificationLevel,verification_note:row.verification_note as string|null,
    verified_at:row.verified_at as string|null,
  };
}

function parseRequest(value:unknown):BusinessVerificationRequest|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(!status(row.requested_level)||!status(row.status)||!optionalString(row.review_note,1000)||!validTime(row.created_at))return null;
  return {
    requested_level:row.requested_level as string,status:row.status as string,
    review_note:row.review_note as string|null,created_at:row.created_at as string,
  };
}

function status(value:unknown){return typeof value==="string"&&statusPattern.test(value)}
function statusOrDefault(value:unknown){return value==null?"unverified":status(value)?value as string:null}
function optionalString(value:unknown,maximum:number){return value===null||typeof value==="string"&&value.length<=maximum}
function optionalTime(value:unknown){return value===null||validTime(value)}
function validTime(value:unknown){return typeof value==="string"&&value.length<=64&&Number.isFinite(Date.parse(value))}

function verificationEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/business/verification",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_BUSINESS_VERIFICATION_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function failed(outcome:string,started:number):GoBusinessReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
