export type SocialRankRow={
  username:string|null;
  display_name:string|null;
  level:number;
  xp:number;
  rating_points:number;
  ai_score:number|null;
  avatar_url:string|null;
  school_name:string|null;
  skills:string[];
  viewer:boolean;
};

export type SocialRankingResponse={ranking:SocialRankRow[]};

export type GoSocialReadResult=
  |{ok:true;value:SocialRankingResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxRankingRows=50;
const maxResponseBytes=256*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usernamePattern=/^[a-z0-9][a-z0-9._-]{2,29}$/;

export function socialRankingShadowEnabled(){
  return process.env.GO_BACKEND_SOCIAL_SHADOW_READS_ENABLED==="true"&&Boolean(socialEndpoint());
}

export function goSocialBackendConfigured(){
  return Boolean(socialEndpoint());
}

export function normalizeSocialRanking(rows:unknown,viewerId?:string):SocialRankingResponse|null{
  if(!Array.isArray(rows)||rows.length>maxRankingRows)return null;
  const ranking:SocialRankRow[]=[];
  for(const item of rows){
    const row=parseRow(item,viewerId);
    if(!row)return null;
    ranking.push(row);
  }
  return {ranking};
}

export async function compareSocialRankingWithGo(token:string,legacy:SocialRankingResponse){
  const result=await readSocialRankingFromGo(token,shadowTimeout());
  const outcome=result.ok?(sameSocialRanking(result.value,legacy)?"match":"mismatch"):result.outcome;
  console.info("go_social_shadow",{route:"social_ranking",outcome,duration_ms:result.durationMs});
}

export async function readSocialRankingFromGo(token:string,timeoutMs:number):Promise<GoSocialReadResult>{
  const started=Date.now();
  try{
    const endpoint=socialEndpoint();
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
    const candidate=JSON.parse(raw) as {ranking?:unknown};
    const value=candidate&&typeof candidate==="object"?normalizeSocialRanking(candidate.ranking):null;
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseRow(item:unknown,viewerId?:string):SocialRankRow|null{
  if(!item||typeof item!=="object")return null;
  const row=item as Record<string,unknown>;
  const goResponse=typeof row.viewer==="boolean";
  if(goResponse){
    if("id" in row)return null;
  }else if(typeof row.id!=="string"||!uuidPattern.test(row.id))return null;
  if(!optionalString(row.username,30)||row.username!==null&&!usernamePattern.test(row.username as string))return null;
  if(!optionalString(row.display_name,120)||!optionalString(row.avatar_url,700)||!optionalString(row.school_name,160))return null;
  if(!boundedInteger(row.level,1,100)||!boundedInteger(row.xp,0,100_000_000)||!boundedInteger(row.rating_points,0,1_000_000_000))return null;
  if(row.ai_score!==null&&!boundedInteger(row.ai_score,0,100))return null;
  if(!Array.isArray(row.skills)||row.skills.length>20||row.skills.some(skill=>typeof skill!=="string"||skill.length>80))return null;
  return {
    username:row.username as string|null,
    display_name:row.display_name as string|null,
    level:row.level as number,
    xp:row.xp as number,
    rating_points:row.rating_points as number,
    ai_score:row.ai_score as number|null,
    avatar_url:row.avatar_url as string|null,
    school_name:row.school_name as string|null,
    skills:(row.skills as string[]).slice(0,3),
    viewer:goResponse?row.viewer as boolean:row.id===viewerId,
  };
}

function optionalString(value:unknown,maximum:number){
  return value===null||typeof value==="string"&&value.length<=maximum;
}

function boundedInteger(value:unknown,minimum:number,maximum:number){
  return typeof value==="number"&&Number.isInteger(value)&&value>=minimum&&value<=maximum;
}

export function sameSocialRanking(candidate:SocialRankingResponse,legacy:SocialRankingResponse){
  return JSON.stringify(candidate)===JSON.stringify(legacy);
}

function socialEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/social/ranking",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_SOCIAL_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function failed(outcome:string,started:number):GoSocialReadResult{
  return {ok:false,outcome,durationMs:Date.now()-started};
}
