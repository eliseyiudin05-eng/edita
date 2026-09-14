import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/public-config";

function publicConfig(){ return getSupabasePublicConfig(); }

export function getSupabaseServiceClient(){
  const {url}=publicConfig();
  const rawServiceKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceKey=rawServiceKey?.replace(/\s+/g,"").trim();
  if(!serviceKey)return null;
  return createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function getUserFromAccessToken(token?:string|null){
  if(!token)return null;
  const {url,key}=publicConfig();
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error)return null;
  return data.user||null;
}

export async function getAuthenticatedProfile(token?:string|null){
  const user=await getUserFromAccessToken(token);
  if(!user)return null;

  const service=getSupabaseServiceClient();
  if(service){
    const {data}=await service.from("profiles")
      .select("id,role,guardian_verified")
      .eq("id",user.id).maybeSingle();
    return data?{user,profile:data}:null;
  }

  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  const {data}=await client.from("profiles")
    .select("id,role,guardian_verified")
    .eq("id",user.id).maybeSingle();

  return data?{user,profile:data}:null;
}

export async function getProfileLearningPreferences(token:string,userId:string){
  const service=getSupabaseServiceClient();
  if(service)return service.from("profiles").select("role,onboarding").eq("id",userId).maybeSingle();

  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  return client.from("profiles").select("role,onboarding").eq("id",userId).maybeSingle();
}

export async function updateProfileSettings(token:string,userId:string,value:{
  displayName:string;username:string;schoolName:string;avatarUrl:string;showSchoolPublicly:boolean;
}){
  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  return client.from("profiles").update({
    display_name:value.displayName,
    username:value.username,
    school_name:value.schoolName||null,
    avatar_url:value.avatarUrl||null,
    show_school_publicly:value.showSchoolPublicly,
  }).eq("id",userId)
    .select("display_name,username,school_name,avatar_url,show_school_publicly")
    .single();
}

export async function getLessonProgress(token:string,userId:string){
  const service=getSupabaseServiceClient();
  if(service)return service.from("lesson_progress")
    .select("status,lessons!inner(slug,xp_reward)")
    .eq("user_id",userId)
    .eq("status","completed");

  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  return client.from("lesson_progress")
    .select("status,lessons!inner(slug,xp_reward)")
    .eq("user_id",userId)
    .eq("status","completed");
}

export async function getSocialRanking(token:string){
  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  return client.from("public_profiles")
    .select("id,username,display_name,level,xp,rating_points,ai_score,avatar_url,school_name,skills")
    .order("rating_points",{ascending:false})
    .order("id",{ascending:true})
    .limit(50);
}

export async function canUseArenaReview(token:string|undefined|null,challengeId?:string|null){
  if(!challengeId)return false;
  const auth=await getAuthenticatedProfile(token);
  if(!auth||auth.profile.role!=="editor")return false;

  const service=getSupabaseServiceClient();
  if(service){
    const {data}=await service.from("challenge_submissions")
      .select("id")
      .eq("challenge_id",challengeId)
      .eq("editor_id",auth.user.id)
      .maybeSingle();
    return Boolean(data);
  }

  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  const {data}=await client.from("challenge_submissions")
    .select("id")
    .eq("challenge_id",challengeId)
    .eq("editor_id",auth.user.id)
    .maybeSingle();
  return Boolean(data);
}

export async function hasFullAccess(token?:string|null){
  return Boolean(await getAuthenticatedProfile(token));
}
