export type SocialGroupProfile={
  username:string|null;
  display_name:string|null;
  level:number;
  xp:number;
  rating_points:number;
  ai_score:number|null;
  avatar_url:string|null;
  school_name:string|null;
};

export type SocialGroupMember={
  user_id:string;
  member_role:"owner"|"member"|"moderator";
  joined_at:string;
  profile:SocialGroupProfile|null;
};

export type SocialStudyGroup={
  id:string;
  name:string;
  description:string|null;
  age_scope:"under14"|"14-17"|"18+";
  join_code:string;
  max_members:number;
  created_at:string;
  members:SocialGroupMember[];
};

export type SocialGroupsResponse={groups:SocialStudyGroup[]};

type GoGroupsReadResult=
  |{ok:true;value:SocialGroupsResponse;durationMs:number}
  |{ok:false;outcome:string;durationMs:number};

const maxGroups=20;
const maxMembers=500;
const maxResponseBytes=256*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const usernamePattern=/^[a-z0-9][a-z0-9._-]{2,29}$/;

export function socialGroupsShadowEnabled(){
  return process.env.GO_BACKEND_SOCIAL_GROUPS_SHADOW_READS_ENABLED==="true"&&Boolean(groupsEndpoint());
}

export function normalizeSocialGroups(value:unknown,legacy=false):SocialGroupsResponse|null{
  if(!Array.isArray(value)||value.length>maxGroups)return null;
  const groups:SocialStudyGroup[]=[];
  let memberCount=0;
  for(const item of value){
    const group=parseGroup(item,legacy);
    if(!group)return null;
    memberCount+=group.members.length;
    if(memberCount>maxMembers)return null;
    groups.push(group);
  }
  groups.sort((left,right)=>right.created_at.localeCompare(left.created_at)||left.id.localeCompare(right.id));
  return {groups};
}

export async function compareSocialGroupsWithGo(token:string,legacy:SocialGroupsResponse){
  const result=await readSocialGroupsFromGo(token,shadowTimeout());
  const outcome=result.ok?(JSON.stringify(result.value)===JSON.stringify(legacy)?"match":"mismatch"):result.outcome;
  console.info("go_social_groups_shadow",{route:"social_groups",outcome,duration_ms:result.durationMs});
}

async function readSocialGroupsFromGo(token:string,timeoutMs:number):Promise<GoGroupsReadResult>{
  const started=Date.now();
  try{
    const endpoint=groupsEndpoint();
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
    const candidate=JSON.parse(raw) as {groups?:unknown};
    const value=candidate&&typeof candidate==="object"?normalizeSocialGroups(candidate.groups):null;
    return value?{ok:true,value,durationMs:Date.now()-started}:failed("invalid_response",started);
  }catch(error){
    const timeout=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
    return failed(timeout?"timeout":"unavailable",started);
  }
}

function parseGroup(value:unknown,legacy:boolean):SocialStudyGroup|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.id!=="string"||!uuidPattern.test(row.id))return null;
  if(typeof row.name!=="string"||row.name.length<2||row.name.length>80)return null;
  if(!optionalString(row.description,300))return null;
  if(row.age_scope!=="under14"&&row.age_scope!=="14-17"&&row.age_scope!=="18+")return null;
  if(typeof row.join_code!=="string"||row.join_code.length<4||row.join_code.length>32||/[\s\r\n]/.test(row.join_code))return null;
  if(!boundedInteger(row.max_members,1,100)||typeof row.created_at!=="string"||row.created_at.length>64||!Number.isFinite(Date.parse(row.created_at)))return null;
  if(!legacy&&"owner_id" in row)return null;
  if(!Array.isArray(row.members)||row.members.length>maxMembers)return null;
  const members:SocialGroupMember[]=[];
  for(const item of row.members){
    const member=parseMember(item);
    if(!member)return null;
    members.push(member);
  }
  members.sort((left,right)=>(right.profile?.rating_points??-1)-(left.profile?.rating_points??-1)||left.user_id.localeCompare(right.user_id));
  return {
    id:row.id,name:row.name,description:row.description as string|null,age_scope:row.age_scope,
    join_code:row.join_code,max_members:row.max_members as number,created_at:row.created_at,members,
  };
}

function parseMember(value:unknown):SocialGroupMember|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(typeof row.user_id!=="string"||!uuidPattern.test(row.user_id))return null;
  if(row.member_role!=="owner"&&row.member_role!=="member"&&row.member_role!=="moderator")return null;
  if(typeof row.joined_at!=="string"||row.joined_at.length>64||!Number.isFinite(Date.parse(row.joined_at)))return null;
  const profile=row.profile===null?null:parseProfile(row.profile);
  if(row.profile!==null&&!profile)return null;
  return {user_id:row.user_id,member_role:row.member_role,joined_at:row.joined_at,profile};
}

function parseProfile(value:unknown):SocialGroupProfile|null{
  if(!value||typeof value!=="object")return null;
  const row=value as Record<string,unknown>;
  if(!optionalString(row.username,30)||row.username!==null&&!usernamePattern.test(row.username as string))return null;
  if(!optionalString(row.display_name,120)||!optionalString(row.avatar_url,700)||!optionalString(row.school_name,160))return null;
  if(!boundedInteger(row.level,1,100)||!boundedInteger(row.xp,0,100_000_000)||!boundedInteger(row.rating_points,0,1_000_000_000))return null;
  if(row.ai_score!==null&&!boundedInteger(row.ai_score,0,100))return null;
  return {
    username:row.username as string|null,display_name:row.display_name as string|null,level:row.level as number,
    xp:row.xp as number,rating_points:row.rating_points as number,ai_score:row.ai_score as number|null,
    avatar_url:row.avatar_url as string|null,school_name:row.school_name as string|null,
  };
}

function optionalString(value:unknown,maximum:number){return value===null||typeof value==="string"&&value.length<=maximum}
function boundedInteger(value:unknown,minimum:number,maximum:number){return typeof value==="number"&&Number.isInteger(value)&&value>=minimum&&value<=maximum}

function groupsEndpoint(){
  try{
    const base=new URL(process.env.GO_BACKEND_URL||"");
    const production=process.env.NODE_ENV==="production"||process.env.VERCEL_ENV==="production";
    if(base.username||base.password||base.search||base.hash||base.pathname!=="/"||!(["https:",...(!production?["http:"]:[])].includes(base.protocol)))return null;
    return new URL("/v1/social/groups",base).toString();
  }catch{return null;}
}

function shadowTimeout(){
  const parsed=Number(process.env.GO_BACKEND_SOCIAL_GROUPS_SHADOW_TIMEOUT_MS||"1000");
  return Number.isInteger(parsed)&&parsed>=250&&parsed<=3000?parsed:1000;
}

function failed(outcome:string,started:number):GoGroupsReadResult{return {ok:false,outcome,durationMs:Date.now()-started}}
