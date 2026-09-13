export type LearningPreferencesResponse={
  role:"editor"|"business"|"admin";
  preferences:{level:string;software:string;goal:string};
};

export function learningPreferencesShadowEnabled(){
  return process.env.GO_BACKEND_SHADOW_READS_ENABLED==="true"&&Boolean(process.env.GO_BACKEND_URL);
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
  const started=Date.now();
  let outcome="unavailable";
  try{
    const endpoint=profileEndpoint();
    if(!endpoint){
      outcome="invalid_configuration";
      return;
    }
    const response=await fetch(endpoint,{
      method:"GET",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
      cache:"no-store",
      redirect:"error",
      signal:AbortSignal.timeout(shadowTimeout()),
    });
    if(!response.ok){
      outcome=`http_${response.status}`;
      return;
    }
    const raw=await response.text();
    if(raw.length>64*1024){
      outcome="response_too_large";
      return;
    }
    const candidate=JSON.parse(raw) as unknown;
    outcome=isSameResponse(candidate,legacy)?"match":"mismatch";
  }catch(error){
    outcome=error instanceof Error&&error.name==="TimeoutError"?"timeout":"unavailable";
  }finally{
    console.info("go_profile_shadow",{route:"learning_preferences",outcome,duration_ms:Date.now()-started});
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

function isSameResponse(candidate:unknown,legacy:LearningPreferencesResponse){
  if(!candidate||typeof candidate!=="object")return false;
  const value=candidate as Partial<LearningPreferencesResponse>;
  return value.role===legacy.role&&
    value.preferences?.level===legacy.preferences.level&&
    value.preferences?.software===legacy.preferences.software&&
    value.preferences?.goal===legacy.preferences.goal;
}
