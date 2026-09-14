export type EditorVerificationRequest={
  id:string;
  portfolio_url:string|null;
  sample_url:string|null;
  note:string|null;
  status:string;
  review_note:string|null;
  created_at:string;
  reviewed_at:string|null;
};

export type EditorVerificationResponse={
  emailVerified:boolean;
  ageGroup:string;
  guardianVerified:boolean;
  level:string;
  request:EditorVerificationRequest|null;
};

type GoReadResult=
  |{ok:true;value:EditorVerificationResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxResponseBytes=32*1024;
const statusPattern=/^[a-z][a-z0-9_]{0,31}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function editorVerificationShadowEnabled(){
  return process.env.GO_BACKEND_EDITOR_VERIFICATION_SHADOW_READS_ENABLED==="true"&&Boolean(endpoint());
}

export function normalizeEditorVerification(value:unknown):EditorVerificationResponse|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.emailVerified!=="boolean"||typeof row.guardianVerified!=="boolean")return null;
  if(typeof row.ageGroup!=="string"||row.ageGroup.length<1||row.ageGroup.length>32||!status(row.level))return null;
  const request=row.request===null?null:parseRequest(row.request);
  if(row.request!==null&&!request)return null;
  return {emailVerified:row.emailVerified,ageGroup:row.ageGroup,guardianVerified:row.guardianVerified,level:row.level as string,request};
}

export async function compareEditorVerificationWithGo(token:string,legacy:EditorVerificationResponse){
  const result=await readFromGo(token,shadowTimeout());
  const outcome=result.ok?(JSON.stringify(result.value)===JSON.stringify(legacy)?"match":"mismatch"):result.outcome;
  console.info("go_editor_verification_shadow",{route:"editor_verification",outcome,duration_ms:result.durationMs});
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
    const value=normalizeEditorVerification(JSON.parse(raw));
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseRequest(value:unknown):EditorVerificationRequest|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.id!=="string"||!uuidPattern.test(row.id)||!optionalString(row.portfolio_url,500)||!optionalString(row.sample_url,500)||!optionalString(row.note,1200)||!status(row.status)||!optionalString(row.review_note,1200)||!validTime(row.created_at)||!optionalTime(row.reviewed_at))return null;
  return {id:row.id,portfolio_url:row.portfolio_url as string|null,sample_url:row.sample_url as string|null,note:row.note as string|null,status:row.status as string,review_note:row.review_note as string|null,created_at:row.created_at as string,reviewed_at:row.reviewed_at as string|null};
}

function status(value:unknown){return typeof value==="string"&&statusPattern.test(value)}
function optionalString(value:unknown,maximum:number){return value===null||typeof value==="string"&&value.length<=maximum}
function validTime(value:unknown){return typeof value==="string"&&value.length<=64&&Number.isFinite(Date.parse(value))}
function optionalTime(value:unknown){return value===null||validTime(value)}
function endpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/editor/verification",base).toString();
  }catch{return null;}
}
function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_EDITOR_VERIFICATION_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}
function failed(outcome:string,started:number):GoReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
