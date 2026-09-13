export const KIVRONIX_SITE_URL="https://kivronix.ru";
export const KIVRONIX_SUPABASE_URL="https://jehrhsdzzbnptrqeatqh.supabase.co";
export const KIVRONIX_SUPABASE_PUBLISHABLE_KEY="sb_publishable_NMNSId1Ozz3_MDG81friXw_-CKhCG6y";

export function getSupabasePublicConfig(){
  return {
    url:process.env.NEXT_PUBLIC_SUPABASE_URL||KIVRONIX_SUPABASE_URL,
    key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||KIVRONIX_SUPABASE_PUBLISHABLE_KEY,
  };
}
