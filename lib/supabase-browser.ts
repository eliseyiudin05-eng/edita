import { createClient } from "@supabase/supabase-js";

const EDITA_SUPABASE_URL = "https://jehrhsdzzbnptrqeatqh.supabase.co";
const EDITA_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NMNSId1Ozz3_MDG81friXw_-CKhCG6y";

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || EDITA_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || EDITA_SUPABASE_PUBLISHABLE_KEY;

  return createClient(url, key);
}
