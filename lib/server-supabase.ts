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
      .select("id,role,plan,plan_expires_at,guardian_verified")
      .eq("id",user.id).maybeSingle();
    return data?{user,profile:data}:null;
  }

  const {url,key}=publicConfig();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{headers:{Authorization:"Bearer "+token}}
  });
  const {data}=await client.from("profiles")
    .select("id,role,plan,plan_expires_at,guardian_verified")
    .eq("id",user.id).maybeSingle();

  return data?{user,profile:data}:null;
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

export async function hasActivePro(token?:string|null){
  const auth=await getAuthenticatedProfile(token);
  if(!auth)return false;
  if(auth.profile.role==="business")return true;
  if(auth.profile.plan!=="pro")return false;
  if(!auth.profile.plan_expires_at)return true;
  return new Date(auth.profile.plan_expires_at).getTime()>Date.now();
}

export async function grantPaidAccess(payment:any){
  const supabase=getSupabaseServiceClient();
  const userId=payment?.metadata?.user_id;
  const product=payment?.metadata?.product;
  if(!supabase||!userId||!product)return {persisted:false};

  const amount=Math.round(Number(payment?.amount?.value||0)*100);
  const {error:paymentError}=await supabase.from("payments").upsert({
    id:payment.id,
    user_id:userId,
    product,
    amount_cents:amount,
    currency:payment?.amount?.currency||"RUB",
    status:payment.status,
    provider:"yookassa",
    provider_payload:{
      order_id:payment?.metadata?.order_id||null,
      test:Boolean(payment?.test),
      captured_at:payment?.captured_at||null
    },
    updated_at:new Date().toISOString()
  });

  if(paymentError)throw paymentError;
  if(payment.status!=="succeeded")return {persisted:true,granted:false};

  const {data:existingEntitlement}=await supabase.from("entitlements")
    .select("id,product,expires_at")
    .eq("source_payment_id",payment.id)
    .maybeSingle();
  if(existingEntitlement){
    return {persisted:true,granted:true,duplicate:true,product:existingEntitlement.product,expiresAt:existingEntitlement.expires_at};
  }

  const {data:profile}=await supabase.from("profiles")
    .select("plan,plan_expires_at")
    .eq("id",userId)
    .maybeSingle();

  let expiresAt:string|null=null;
  let plan=profile?.plan||"free";

  if(product==="ai-pro-30"){
    plan="pro";
    const now=Date.now();
    const current=profile?.plan_expires_at?new Date(profile.plan_expires_at).getTime():0;
    const base=Math.max(now,current);
    expiresAt=new Date(base+30*24*60*60*1000).toISOString();
  }else{
    const activePro=profile?.plan==="pro"&&(!profile?.plan_expires_at||new Date(profile.plan_expires_at).getTime()>Date.now());
    if(!activePro)plan="start";
  }

  const {error:entitlementError}=await supabase.from("entitlements").upsert({
    user_id:userId,
    product,
    source_payment_id:payment.id,
    starts_at:new Date().toISOString(),
    expires_at:expiresAt
  },{onConflict:"source_payment_id"});
  if(entitlementError)throw entitlementError;

  const update:any={plan};
  if(product==="ai-pro-30")update.plan_expires_at=expiresAt;
  const {error:profileError}=await supabase.from("profiles").update(update).eq("id",userId);
  if(profileError)throw profileError;

  return {persisted:true,granted:true,plan,expiresAt};
}
