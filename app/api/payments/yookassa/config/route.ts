import { NextResponse } from "next/server";
import { getYooKassaConfig } from "@/lib/yookassa";

export async function GET() {
  return NextResponse.json({
    configured: Boolean(getYooKassaConfig()),
    mode: process.env.YOOKASSA_MODE || "test",
  });
}
