import {randomInt} from "node:crypto";
import {goProfileSettingsBackendConfigured,normalizeProfileSettings,sameProfileSettings,type ProfileSettings} from "@/lib/go-profile-settings-shadow";

const route="profile_settings_update";
const recentHealth:boolean[]=[];
let openUntil=0;

export async function tryProfileSettingsUpdateCanary(token:string,value:ProfileSettings):Promise<ProfileSettings|null>{
  if(!selected())return null;
  const started=Date.now();
  let outcome="unavailable";
  try{
    const target=endpoint();
    if(!target)outcome="invalid_configuration";
    else{
      const response=await fetch(target,{
        method:"POST",headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify(value),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeout()),
      });
      if(!response.ok)outcome=`http_${response.status}`;
      else{
        const declared=Number(response.headers.get("content-length")||"0");
        if(Number.isFinite(declared)&&declared>64*1024)outcome="response_too_large";
        else{
          const raw=await response.text();
          if(new TextEncoder().encode(raw).byteLength>64*1024)outcome="response_too_large";
          else{
            const candidate=normalizeProfileSettings(JSON.parse(raw));
            if(candidate&&sameProfileSettings(candidate,value)){
              const durationMs=Date.now()-started;
              if(durationMs>maxLatency())outcome="slow";
              else{
                recordHealth(true);log("success",durationMs);return candidate;
              }
            }else outcome="invalid_response";
          }
        }
      }
    }
  }catch(error){outcome=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable"}
  const durationMs=Date.now()-started;
  recordHealth(false);log(outcome,durationMs);return null;
}

function selected(){
  if(process.env.GO_BACKEND_PROFILE_SETTINGS_UPDATE_CANARY_ENABLED!=="true"||!goProfileSettingsBackendConfigured()||Date.now()<openUntil)return false;
  if(openUntil){openUntil=0;recentHealth.length=0;console.info("go_profile_settings_update_canary",{route,outcome:"circuit_recovered"})}
  return randomInt(10_000)<Math.round(percent()*100);
}

function recordHealth(healthy:boolean){
  recentHealth.push(healthy);if(recentHealth.length>20)recentHealth.shift();
  const failures=recentHealth.filter(value=>!value).length;
  if(recentHealth.length>=10&&failures/recentHealth.length>=0.2){
    openUntil=Date.now()+5*60*1000;recentHealth.length=0;
    console.warn("go_profile_settings_update_canary",{route,outcome:"circuit_open",cooldown_ms:5*60*1000});
  }
}

function endpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    return new URL("/v1/profile/settings",base).toString();
  }catch{return null;}
}

function percent(){const value=Number(process.env.GO_BACKEND_PROFILE_SETTINGS_UPDATE_CANARY_PERCENT||"1");return Number.isFinite(value)&&value>0&&value<=10?value:1}
function timeout(){const value=Number(process.env.GO_BACKEND_PROFILE_SETTINGS_UPDATE_CANARY_TIMEOUT_MS||"1000");return Number.isInteger(value)&&value>=250&&value<=3000?value:1000}
function maxLatency(){const value=Number(process.env.GO_BACKEND_PROFILE_SETTINGS_UPDATE_CANARY_MAX_LATENCY_MS||"750");const limit=timeout();return Number.isInteger(value)&&value>=100&&value<=limit?value:Math.min(750,limit)}
function log(outcome:string,durationMs:number){console.info("go_profile_settings_update_canary",{route,outcome,duration_ms:durationMs,percentage:percent()})}
