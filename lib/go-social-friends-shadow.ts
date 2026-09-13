export type SocialFriendProfile={
  username:string|null;
  display_name:string|null;
  level:number;
  xp:number;
  rating_points:number;
  ai_score:number|null;
  avatar_url:string|null;
  school_name:string|null;
};

export type SocialFriendRelation={
  id:string;
  status:"pending"|"accepted"|"declined";
  direction:"incoming"|"outgoing";
  created_at:string;
  other:SocialFriendProfile|null;
};

export type SocialFriendsResponse={relations:SocialFriendRelation[]};

type GoFriendsReadResult=
  |{ok:true;value:SocialFriendsResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxFriendRows=200;
const maxResponseBytes=256*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usernamePattern=/^[a-z0-9][a-z0-9._-]{2,29}$/;

export function socialFriendsShadowEnabled(){
  return process.env.GO_BACKEND_SOCIAL_FRIENDS_SHADOW_READS_ENABLED==="true"&&Boolean(friendsEndpoint());
}

export function normalizeSocialFriends(relations:unknown,viewerId?:string):SocialFriendsResponse|null{
  if(!Array.isArray(relations)||relations.length>maxFriendRows)return null;
  const normalized:SocialFriendRelation[]=[];
  for(const item of relations){
    const relation=parseRelation(item,viewerId);
    if(!relation)return null;
    normalized.push(relation);
  }
  return {relations:normalized};
}

export async function compareSocialFriendsWithGo(token:string,legacy:SocialFriendsResponse){
  const result=await readSocialFriendsFromGo(token,shadowTimeout());
  const outcome=result.ok?(JSON.stringify(result.value)===JSON.stringify(legacy)?"match":"mismatch"):result.outcome;
  console.info("go_social_friends_shadow",{route:"social_friends",outcome,duration_ms:result.durationMs});
}

async function readSocialFriendsFromGo(token:string,timeoutMs:number):Promise<GoFriendsReadResult>{
  const started=Date.now();
  try{
    const endpoint=friendsEndpoint();
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
    const candidate=JSON.parse(raw) as {relations?:unknown};
    const value=candidate&&typeof candidate==="object"?normalizeSocialFriends(candidate.relations):null;
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseRelation(item:unknown,viewerId?:string):SocialFriendRelation|null{
  if(!item||typeof item!=="object")return null;
  const row=item as Record<string,unknown>;
  if(typeof row.id!=="string"||!uuidPattern.test(row.id))return null;
  if(row.status!=="pending"&&row.status!=="accepted"&&row.status!=="declined")return null;
  if(typeof row.created_at!=="string"||row.created_at.length>64||!Number.isFinite(Date.parse(row.created_at)))return null;

  let direction=row.direction;
  if(direction!=="incoming"&&direction!=="outgoing"){
    if(!viewerId||typeof row.requester_id!=="string"||typeof row.addressee_id!=="string"||
      !uuidPattern.test(row.requester_id)||!uuidPattern.test(row.addressee_id) ||
      row.requester_id===row.addressee_id ||
      row.requester_id!==viewerId&&row.addressee_id!==viewerId)return null;
    direction=row.requester_id===viewerId?"outgoing":"incoming";
  }else if("requester_id" in row||"addressee_id" in row)return null;

  const other=row.other===null?null:parseProfile(row.other);
  if(row.other!==null&&!other)return null;
  return {id:row.id,status:row.status,direction:direction as "incoming"|"outgoing",created_at:row.created_at,other};
}

function parseProfile(value:unknown):SocialFriendProfile|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(!optionalString(row.username,30)||row.username!==null&&!usernamePattern.test(row.username as string))return null;
  if(!optionalString(row.display_name,120)||!optionalString(row.avatar_url,700)||!optionalString(row.school_name,160))return null;
  if(!boundedInteger(row.level,1,100)||!boundedInteger(row.xp,0,100_000_000)||!boundedInteger(row.rating_points,0,1_000_000_000))return null;
  if(row.ai_score!==null&&!boundedInteger(row.ai_score,0,100))return null;
  return {
    username:row.username as string|null,
    display_name:row.display_name as string|null,
    level:row.level as number,
    xp:row.xp as number,
    rating_points:row.rating_points as number,
    ai_score:row.ai_score as number|null,
    avatar_url:row.avatar_url as string|null,
    school_name:row.school_name as string|null,
  };
}

function optionalString(value:unknown,maximum:number){
  return value===null||typeof value==="string"&&value.length<=maximum;
}

function boundedInteger(value:unknown,minimum:number,maximum:number){
  return typeof value==="number"&&Number.isInteger(value)&&value>=minimum&&value<=maximum;
}

function friendsEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/social/friends",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_SOCIAL_FRIENDS_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function failed(outcome:string,started:number):GoFriendsReadResult{
  return {ok:false,outcome,durationMs:Date.now()-started};
}
