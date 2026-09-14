export type ProfileSettings={displayName:string;username:string;schoolName:string;avatarUrl:string;showSchoolPublicly:boolean};

type ReadResult=
  |{ok:true;value:ProfileSettings;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const route="profile_settings";

export function profileSettingsShadowEnabled(){
  return process.env.GO_BACKEND_PROFILE_SETTINGS_SHADOW_READS_ENABLED==="true"&&Boolean(endpoint());
}

export function normalizeProfileSettings(value:unknown):ProfileSettings|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;
  const displayName=nullableString(row.display_name??row.displayName,120);
  const username=nullableString(row.username,30);
  const schoolName=nullableString(row.school_name??row.schoolName,160);
  const avatarUrl=nullableString(row.avatar_url??row.avatarUrl,4096);
  const showSchoolPublicly=row.show_school_publicly??row.showSchoolPublicly;
  if(displayName===null||username===null||schoolName===null||avatarUrl===null||typeof showSchoolPublicly!=="boolean")return null;
  return {displayName,username,schoolName,avatarUrl,showSchoolPublicly};
}

export async function compareProfileSettingsWithGo(token:string,legacy:ProfileSettings){
  const result=await readFromGo(token,timeout());
  const outcome=result.ok?(same(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_profile_settings_shadow",{route,outcome,duration_ms:result.durationMs});
}

async function readFromGo(token:string,timeoutMs:number):Promise<ReadResult>{
  const started=Date.now();
  try{
    const target=endpoint();
    if(!target)return {ok:false,outcome:"invalid_configuration",durationMs:Date.now()-started};
    const response=await fetch(target,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)return {ok:false,outcome:`http_${response.status}`,durationMs:Date.now()-started};
    const declared=Number(response.headers.get("content-length")||"0");
    if(Number.isFinite(declared)&&declared>64*1024)return {ok:false,outcome:"response_too_large",durationMs:Date.now()-started};
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>64*1024)return {ok:false,outcome:"response_too_large",durationMs:Date.now()-started};
    const value=normalizeProfileSettings(JSON.parse(raw));
    if(!value)return {ok:false,outcome:"invalid_response",durationMs:Date.now()-started};
    return {ok:true,value,durationMs:Date.now()-started};
  }catch(error){
    const outcome=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable";
    return {ok:false,outcome,durationMs:Date.now()-started};
  }
}

function endpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/profile/settings",base).toString();
  }catch{return null;}
}

function nullableString(value:unknown,max:number){
  if(value===null||value===undefined)return "";
  return typeof value==="string"&&[...value].length<=max&&!/[\r\n]/.test(max>1000?value:"")?value:null;
}

function same(left:ProfileSettings,right:ProfileSettings){
  return left.displayName===right.displayName&&left.username===right.username&&left.schoolName===right.schoolName&&left.avatarUrl===right.avatarUrl&&left.showSchoolPublicly===right.showSchoolPublicly;
}

function timeout(){const value=Number(process.env.GO_BACKEND_PROFILE_SETTINGS_SHADOW_TIMEOUT_MS||"1000");return Number.isInteger(value)&&value>=250&&value<=3000?value:1000}
