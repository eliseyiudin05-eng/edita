export const EDITA_SITE_URL="https://getedita.app";
export const EDITA_SUPABASE_URL="https://jehrhsdzzbnptrqeatqh.supabase.co";
export const EDITA_SUPABASE_PUBLISHABLE_KEY="sb_publishable_NMNSId1Ozz3_MDG81friXw_-CKhCG6y";

export function getSupabasePublicConfig(){
  return {
    url:process.env.NEXT_PUBLIC_SUPABASE_URL||EDITA_SUPABASE_URL,
    key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||EDITA_SUPABASE_PUBLISHABLE_KEY,
  };
}
