import { NextResponse } from "next/server";
import { KIVRONIX_SITE_URL, getSupabasePublicConfig } from "@/lib/public-config";

// ENV_SYNC_BUILD: force a fresh production deployment from main.

export async function GET() {
  const supabase=getSupabasePublicConfig();
  return NextResponse.json({
    ok:true,
    environment:process.env.VERCEL_ENV||process.env.NODE_ENV||"unknown",
    commit:(process.env.VERCEL_GIT_COMMIT_SHA||"local").slice(0,7),
    siteUrl:KIVRONIX_SITE_URL,
    services:{
      openai:{
        configured:Boolean(process.env.OPENAI_API_KEY),
        model:process.env.OPENAI_MODEL||"gpt-5.6-luna",
      },
      supabase:{
        configured:Boolean(supabase.url&&supabase.key),
        serverWrites:Boolean(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      email:{
        configured:Boolean(process.env.RESEND_API_KEY),
        provider:"Resend",
        senderBrand:"KIVRONIX",
      },
    },
  });
}
