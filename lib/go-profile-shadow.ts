export type LearningPreferencesResponse={
  role:"editor"|"business"|"admin";
  preferences:{level:string;software:string;goal:string};
};

export type GoProfileReadResult=
  |{ok:true;value:LearningPreferencesResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

export function learningPreferencesShadowEnabled(){
  return process.env.GO_BACKEND_SHADOW_READS_ENABLED==="true"&&Boolean(process.env.GO_BACKEND_URL);
}

export function goProfileBackendConfigured(){
  return Boolean(profileEndpoint());
}

export function normalizeLearningPreferences(role:unknown,onboarding:unknown):LearningPreferencesResponse|null{
  if(role!=="editor"&&role!=="business"&&role!=="admin")return null;
  const source=onboarding&&typeof onboarding==="object"?onboarding as Record<string,unknown>:{};
  return {
    role,
    preferences:{
      level:boundedString(source.level),
      software:boundedString(source.software),
      goal:boundedString(source.goal),
    },
  };
}

export async function compareLearningPreferencesWithGo(token:string,legacy:LearningPreferencesResponse){
  const result=await readLearningPreferencesFromGo(token,shadowTimeout());
  const outcome=result.ok?(sameLearningPreferences(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_profile_shadow",{route:"learning_preferences",outcome,duration_ms:result.durationMs});
}

export async function readLearningPreferencesFromGo(token:string,timeoutMs:number):Promise<GoProfileReadResult>{
  const started=Date.now();
  try{
    const endpoint=profileEndpoint();
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
    if(Number.isFinite(declaredLength)&&declaredLength>64*1024)return failed("response_too_large",started);
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>64*1024)return failed("response_too_large",started);
    const value=parseLearningPreferences(JSON.parse(raw) as unknown);
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function profileEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/profile/learning-preferences",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function boundedString(value:unknown){
  return typeof value==="string"?value.slice(0,80):"";
}

function parseLearningPreferences(candidate:unknown):LearningPreferencesResponse|null{
  if(!candidate||typeof candidate!=="object")return null;
  const value=candidate as Partial<LearningPreferencesResponse>;
  if(value.role!=="editor"&&value.role!=="business"&&value.role!=="admin")return null;
  const preferences=value.preferences;
  if(!preferences||typeof preferences.level!=="string"||typeof preferences.software!=="string"||typeof preferences.goal!=="string")return null;
  if(preferences.level.length>80||preferences.software.length>80||preferences.goal.length>80)return null;
  return {role:value.role,preferences:{level:preferences.level,software:preferences.software,goal:preferences.goal}};
}

export function sameLearningPreferences(candidate:LearningPreferencesResponse,legacy:LearningPreferencesResponse){
  return candidate.role===legacy.role&&
    candidate.preferences.level===legacy.preferences.level&&
    candidate.preferences.software===legacy.preferences.software&&
    candidate.preferences.goal===legacy.preferences.goal;
}

function failed(outcome:string,started:number):GoProfileReadResult{
  return {ok:false,outcome,durationMs:Date.now()-started};
}
