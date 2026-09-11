import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/public-config";

export function getSupabaseBrowserClient() {
  const {url,key}=getSupabasePublicConfig();
  return createClient(url,key);
}
