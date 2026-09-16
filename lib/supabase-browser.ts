import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/public-config";

let browserClient:SupabaseClient|null=null;

export function getSupabaseBrowserClient() {
  if(browserClient)return browserClient;
  const {url,key}=getSupabasePublicConfig();
  browserClient=createClient(url,key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
  });
  return browserClient;
}

export async function getFreshAccessToken(){
  const client=getSupabaseBrowserClient();
  const {data:{session}}=await client.auth.getSession();
  if(session?.access_token&&(!session.expires_at||session.expires_at*1000>Date.now()+30_000))return session.access_token;
  const {data}=await client.auth.refreshSession();
  return data.session?.access_token||"";
}
