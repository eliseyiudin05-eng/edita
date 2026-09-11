import { createClient } from "@supabase/supabase-js";

const EDITA_SUPABASE_URL="https://jehrhsdzzbnptrqeatqh.supabase.co";
const EDITA_SUPABASE_PUBLISHABLE_KEY="sb_publishable_NMNSId1Ozz3_MDG81friXw_-CKhCG6y";

function publicConfig(){
  return {
    url:process.env.NEXT_PUBLIC_SUPABASE_URL||EDITA_SUPABASE_URL,
    key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||EDITA_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getSupabaseServiceClient(){
  const {url}=publicConfig();
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  let expiresAt:string|null=null;
  let plan="start";

  if(product==="ai-pro-30"){
    plan="pro";
    const {data:profile}=await supabase.from("profiles").select("plan_expires_at").eq("id",userId).maybeSingle();
    const now=Date.now();
    const current=profile?.plan_expires_at?new Date(profile.plan_expires_at).getTime():0;
    const base=Math.max(now,current);
    expiresAt=new Date(base+30*24*60*60*1000).toISOString();
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
  if(plan==="pro")update.plan_expires_at=expiresAt;
  const {error:profileError}=await supabase.from("profiles").update(update).eq("id",userId);
  if(profileError)throw profileError;

  return {persisted:true,granted:true,plan,expiresAt};
}
