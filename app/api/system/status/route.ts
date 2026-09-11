import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || null,
    services: {
      openai: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      },
      supabase: {
        configured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ),
        serverWrites: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      yookassa: {
        configured: Boolean(
          process.env.YOOKASSA_SHOP_ID &&
          process.env.YOOKASSA_SECRET_KEY
        ),
        mode: process.env.YOOKASSA_MODE || "test",
      },
    },
  });
}
