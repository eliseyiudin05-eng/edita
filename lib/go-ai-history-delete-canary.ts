import {randomInt} from "node:crypto";
import {goAiHistoryBackendConfigured,goAiHistoryEndpoint} from "@/lib/go-ai-history-shadow";

type DeleteCanaryResult=
  |{attempted:false}
  |{attempted:true;ok:boolean};

const route="ai_history_delete";
const sampleWindow=20;
const minimumSamples=10;
const failureThreshold=0.2;
const cooldownMs=5*60*1000;
const recentHealth:boolean[]=[];
let openUntil=0;

export function aiHistoryDeleteCanaryEnabled(){
  return process.env.GO_BACKEND_AI_HISTORY_DELETE_CANARY_ENABLED==="true"&&goAiHistoryBackendConfigured();
}

export async function tryAiHistoryDeleteCanary(token:string,scope:string):Promise<DeleteCanaryResult>{
  if(!canarySelected())return {attempted:false};
  const started=Date.now();
  let outcome="unavailable";
  try{
    const endpoint=goAiHistoryEndpoint(scope);
    if(!endpoint)outcome="invalid_configuration";
    else{
      const response=await fetch(endpoint,{
        method:"DELETE",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store",redirect:"error",
        signal:AbortSignal.timeout(canaryTimeout()),
      });
      if(!response.ok)outcome=`http_${response.status}`;
      else{
        const raw=await response.text();
        if(new TextEncoder().encode(raw).byteLength>1024)outcome="response_too_large";
        else{
          const value=JSON.parse(raw) as unknown;
          if(value&&typeof value==="object"&&!Array.isArray(value)&&(value as Record<string,unknown>).ok===true&&Object.keys(value).length===1){
            const durationMs=Date.now()-started;
            if(durationMs>canaryMaxLatency()){
              recordHealth(false);
              logAttempt("slow",durationMs);
              return {attempted:true,ok:false};
            }
            recordHealth(true);
            logAttempt("success",durationMs);
            return {attempted:true,ok:true};
          }
          outcome="invalid_response";
        }
      }
    }
  }catch(error){
    outcome=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable";
  }
  const durationMs=Date.now()-started;
  recordHealth(false);
  logAttempt(outcome,durationMs);
  return {attempted:true,ok:false};
}

function canarySelected(){
  if(!aiHistoryDeleteCanaryEnabled())return false;
  if(Date.now()<openUntil)return false;
  if(openUntil){
    openUntil=0;
    recentHealth.length=0;
    console.info("go_ai_history_delete_canary",{route,outcome:"circuit_recovered"});
  }
  return randomInt(10_000)<Math.round(canaryPercent()*100);
}

function recordHealth(healthy:boolean){
  if(Date.now()<openUntil)return;
  recentHealth.push(healthy);
  if(recentHealth.length>sampleWindow)recentHealth.shift();
  const failures=recentHealth.filter(value=>!value).length;
  if(recentHealth.length>=minimumSamples&&failures/recentHealth.length>=failureThreshold){
    openUntil=Date.now()+cooldownMs;
    recentHealth.length=0;
    console.warn("go_ai_history_delete_canary",{route,outcome:"circuit_open",cooldown_ms:cooldownMs});
  }
}

function canaryPercent(){
  const parsed=Number(process.env.GO_BACKEND_AI_HISTORY_DELETE_CANARY_PERCENT||"1");
  return Number.isFinite(parsed)&&parsed>0&&parsed<=10?parsed:1;
}

function canaryTimeout(){
  const parsed=Number(process.env.GO_BACKEND_AI_HISTORY_DELETE_CANARY_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function canaryMaxLatency(){
  const parsed=Number(process.env.GO_BACKEND_AI_HISTORY_DELETE_CANARY_MAX_LATENCY_MS||"750");
  const timeout=canaryTimeout();
  return Number.isInteger(parsed)&&parsed>=100&&parsed<=timeout?parsed:Math.min(750,timeout);
}

function logAttempt(outcome:string,durationMs:number){
  console.info("go_ai_history_delete_canary",{route,outcome,duration_ms:durationMs,percentage:canaryPercent()});
}
