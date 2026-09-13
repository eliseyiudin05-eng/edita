import {randomInt} from "node:crypto";
import {
  goProfileBackendConfigured,
  readLearningPreferencesFromGo,
  sameLearningPreferences,
  type LearningPreferencesResponse,
} from "@/lib/go-profile-shadow";

type CanaryResult=
  |{attempted:false}
  |{attempted:true;value:LearningPreferencesResponse|null};

const route="learning_preferences";
const sampleWindow=20;
const minimumSamples=10;
const failureThreshold=0.2;
const cooldownMs=5*60*1000;
const recentHealth:boolean[]=[];
let openUntil=0;

export function learningPreferencesCanaryEnabled(){
  return process.env.GO_BACKEND_CANARY_READS_ENABLED==="true"&&goProfileBackendConfigured();
}

export async function tryLearningPreferencesCanary(token:string):Promise<CanaryResult>{
  if(!canarySelected())return {attempted:false};

  const result=await readLearningPreferencesFromGo(token,canaryTimeout());
  if(!result.ok){
    recordHealth(false);
    logAttempt(result.outcome,result.durationMs);
    return {attempted:true,value:null};
  }
  if(result.durationMs>canaryMaxLatency()){
    recordHealth(false);
    logAttempt("slow",result.durationMs);
    return {attempted:true,value:null};
  }

  logAttempt("success",result.durationMs);
  return {attempted:true,value:result.value};
}

export function recordLearningPreferencesCanaryComparison(
  candidate:LearningPreferencesResponse,
  legacy:LearningPreferencesResponse|null,
){
  if(!legacy){
    console.info("go_profile_canary_compare",{route,outcome:"legacy_unavailable"});
    return;
  }
  const match=sameLearningPreferences(candidate,legacy);
  recordHealth(match,!match);
  console.info("go_profile_canary_compare",{route,outcome:match?"match":"mismatch"});
}

function canarySelected(){
  if(!learningPreferencesCanaryEnabled())return false;
  if(Date.now()<openUntil)return false;
  if(openUntil){
    openUntil=0;
    recentHealth.length=0;
    console.info("go_profile_canary",{route,outcome:"circuit_recovered"});
  }
  return randomInt(10_000)<Math.round(canaryPercent()*100);
}

function recordHealth(healthy:boolean,severe=false){
  if(Date.now()<openUntil)return;
  recentHealth.push(healthy);
  if(recentHealth.length>sampleWindow)recentHealth.shift();
  const failures=recentHealth.filter(value=>!value).length;
  if(severe||(recentHealth.length>=minimumSamples&&failures/recentHealth.length>=failureThreshold)){
    openUntil=Date.now()+cooldownMs;
    recentHealth.length=0;
    console.warn("go_profile_canary",{route,outcome:"circuit_open",cooldown_ms:cooldownMs});
  }
}

function canaryPercent(){
  const parsed=Number(process.env.GO_BACKEND_CANARY_PERCENT||"1");
  return Number.isFinite(parsed)&&parsed>0&&parsed<=10?parsed:1;
}

function canaryTimeout(){
  const parsed=Number(process.env.GO_BACKEND_CANARY_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function canaryMaxLatency(){
  const parsed=Number(process.env.GO_BACKEND_CANARY_MAX_LATENCY_MS||"750");
  const timeout=canaryTimeout();
  return Number.isInteger(parsed)&&parsed>=100&&parsed<=timeout?parsed:Math.min(750,timeout);
}

function logAttempt(outcome:string,durationMs:number){
  console.info("go_profile_canary",{route,outcome,duration_ms:durationMs,percentage:canaryPercent()});
}
