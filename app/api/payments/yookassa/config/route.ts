import { NextResponse } from "next/server";
import { getYooKassaConfig } from "@/lib/yookassa";

export async function GET() {
  const enabled=process.env.BETA_FREE_MODE==="false";
  return NextResponse.json({
    configured: Boolean(getYooKassaConfig()),
    enabled,
    mode: enabled?(process.env.YOOKASSA_MODE || "test"):"disabled_for_beta",
  });
}
