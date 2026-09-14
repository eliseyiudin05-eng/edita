import {randomInt} from "node:crypto";
import {goProfileBackendConfigured} from "@/lib/go-profile-shadow";

type Preferences={level:string;software:string;goal:string};
type UpdateResponse={ok:true;onboarding:Record<string,unknown>};

const route="learning_preferences_update";
const recentHealth:boolean[]=[];
let openUntil=0;

export async function tryLearningPreferencesUpdateCanary(token:string,value:Preferences):Promise<UpdateResponse|null>{
  if(!selected())return null;
  const started=Date.now();
  let outcome="unavailable";
  try{
    const endpoint=profileEndpoint();
    if(!endpoint)outcome="invalid_configuration";
    else{
      const response=await fetch(endpoint,{
        method:"POST",headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify(value),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeout()),
      });
      if(!response.ok)outcome=`http_${response.status}`;
      else{
        const raw=await response.text();
        if(new TextEncoder().encode(raw).byteLength>64*1024)outcome="response_too_large";
        else{
          const candidate=parseResponse(JSON.parse(raw),value);
          if(candidate){
            const durationMs=Date.now()-started;
            if(durationMs>maxLatency())outcome="slow";
            else{
              recordHealth(true);log("success",durationMs);return candidate;
            }
          }else outcome="invalid_response";
        }
      }
    }
  }catch(error){outcome=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable"}
  const durationMs=Date.now()-started;
  recordHealth(false);log(outcome,durationMs);return null;
}

function parseResponse(candidate:unknown,value:Preferences):UpdateResponse|null{
  if(!candidate||typeof candidate!=="object")return null;
  const response=candidate as Partial<UpdateResponse>;
  const onboarding=response.onboarding;
  if(response.ok!==true||!onboarding||typeof onboarding!=="object"||Array.isArray(onboarding))return null;
  if(onboarding.level!==value.level||onboarding.software!==value.software||onboarding.goal!==value.goal)return null;
  return {ok:true,onboarding};
}

function selected(){
  if(process.env.GO_BACKEND_PROFILE_UPDATE_CANARY_ENABLED!=="true"||!goProfileBackendConfigured()||Date.now()<openUntil)return false;
  if(openUntil){openUntil=0;recentHealth.length=0;console.info("go_profile_update_canary",{route,outcome:"circuit_recovered"})}
  return randomInt(10_000)<Math.round(percent()*100);
}

function recordHealth(healthy:boolean){
  recentHealth.push(healthy);if(recentHealth.length>20)recentHealth.shift();
  const failures=recentHealth.filter(value=>!value).length;
  if(recentHealth.length>=10&&failures/recentHealth.length>=0.2){
    openUntil=Date.now()+5*60*1000;recentHealth.length=0;
    console.warn("go_profile_update_canary",{route,outcome:"circuit_open",cooldown_ms:5*60*1000});
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

function percent(){const value=Number(process.env.GO_BACKEND_PROFILE_UPDATE_CANARY_PERCENT||"1");return Number.isFinite(value)&&value>0&&value<=10?value:1}
function timeout(){const value=Number(process.env.GO_BACKEND_PROFILE_UPDATE_CANARY_TIMEOUT_MS||"1000");return Number.isInteger(value)&&value>=250&&value<=3000?value:1000}
function maxLatency(){const value=Number(process.env.GO_BACKEND_PROFILE_UPDATE_CANARY_MAX_LATENCY_MS||"750");const limit=timeout();return Number.isInteger(value)&&value>=100&&value<=limit?value:Math.min(750,limit)}
function log(outcome:string,durationMs:number){console.info("go_profile_update_canary",{route,outcome,duration_ms:durationMs,percentage:percent()})}
