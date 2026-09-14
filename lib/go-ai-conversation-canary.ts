import {randomInt} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getOrCreateConversation} from "@/lib/ai-history";
import {goAiConversationEndpoint,goAiHistoryBackendConfigured,normalizeAiConversation,type AiHistoryConversation} from "@/lib/go-ai-history-shadow";

const route="ai_conversation_ensure";
const recentHealth:boolean[]=[];
let openUntil=0;

export async function getOrCreateAiConversationWithCanary(service:SupabaseClient,userId:string,token:string,scope:string,title:string,lessonSlug?:string|null){
  const safeTitle=String(title||"Помощник KIVRONIX").slice(0,120);
  const safeLessonSlug=lessonSlug?String(lessonSlug).slice(0,120):null;
  if(canarySelected()){
    const candidate=await ensureWithGo(token,scope,safeTitle,safeLessonSlug);
    if(candidate)return candidate;
  }
  return getOrCreateConversation(service,userId,scope,safeTitle,safeLessonSlug);
}

function enabled(){return process.env.GO_BACKEND_AI_CONVERSATION_CANARY_ENABLED==="true"&&goAiHistoryBackendConfigured()}

async function ensureWithGo(token:string,scope:string,title:string,lessonSlug:string|null):Promise<AiHistoryConversation|null>{
  const started=Date.now();
  let outcome="unavailable";
  try{
    const endpoint=goAiConversationEndpoint();
    if(!endpoint)outcome="invalid_configuration";
    else{
      const response=await fetch(endpoint,{
        method:"POST",headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify({scope_key:scope,title,lesson_slug:lessonSlug}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(timeout()),
      });
      if(!response.ok)outcome=`http_${response.status}`;
      else{
        const raw=await response.text();
        if(new TextEncoder().encode(raw).byteLength>32*1024)outcome="response_too_large";
        else{
          const value=normalizeAiConversation(JSON.parse(raw),scope);
          if(value){
            const durationMs=Date.now()-started;
            if(durationMs>maxLatency())outcome="slow";
            else{
              recordHealth(true);
              log("success",durationMs);
              return value;
            }
          }else outcome="invalid_response";
        }
      }
    }
  }catch(error){outcome=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")?"timeout":"unavailable"}
  const durationMs=Date.now()-started;
  recordHealth(false);
  log(outcome,durationMs);
  return null;
}

function canarySelected(){
  if(!enabled()||Date.now()<openUntil)return false;
  if(openUntil){openUntil=0;recentHealth.length=0;console.info("go_ai_conversation_canary",{route,outcome:"circuit_recovered"})}
  return randomInt(10_000)<Math.round(percent()*100);
}

function recordHealth(healthy:boolean){
  recentHealth.push(healthy);
  if(recentHealth.length>20)recentHealth.shift();
  const failures=recentHealth.filter(value=>!value).length;
  if(recentHealth.length>=10&&failures/recentHealth.length>=0.2){
    openUntil=Date.now()+5*60*1000;recentHealth.length=0;
    console.warn("go_ai_conversation_canary",{route,outcome:"circuit_open",cooldown_ms:5*60*1000});
  }
}

function percent(){const value=Number(process.env.GO_BACKEND_AI_CONVERSATION_CANARY_PERCENT||"1");return Number.isFinite(value)&&value>0&&value<=10?value:1}
function timeout(){const value=Number(process.env.GO_BACKEND_AI_CONVERSATION_CANARY_TIMEOUT_MS||"1000");return Number.isInteger(value)&&value>=250&&value<=3000?value:1000}
function maxLatency(){const value=Number(process.env.GO_BACKEND_AI_CONVERSATION_CANARY_MAX_LATENCY_MS||"750");const limit=timeout();return Number.isInteger(value)&&value>=100&&value<=limit?value:Math.min(750,limit)}
function log(outcome:string,durationMs:number){console.info("go_ai_conversation_canary",{route,outcome,duration_ms:durationMs,percentage:percent()})}
