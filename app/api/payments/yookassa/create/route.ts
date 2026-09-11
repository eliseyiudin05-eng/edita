import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createPayment, PRODUCTS, type EditaProduct } from "@/lib/yookassa";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const product = body?.product as EditaProduct;
    const customerEmail =
      typeof body?.email === "string" && body.email.includes("@")
        ? body.email.trim()
        : undefined;

    if (!PRODUCTS[product]) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      req.nextUrl.origin;

    const { data, orderId } = await createPayment({
      product,
      customerEmail,
      returnUrl: siteUrl + "/payment/return",
    });

    const confirmationUrl = data?.confirmation?.confirmation_url;
    if (!data?.id || !confirmationUrl) {
      return NextResponse.json(
        { error: "YooKassa did not return confirmation URL" },
        { status: 502 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("edita_last_payment_id", data.id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 2,
      path: "/",
    });
    cookieStore.set("edita_last_product", product, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 2,
      path: "/",
    });

    return NextResponse.json({
      paymentId: data.id,
      orderId,
      confirmationUrl,
    });
  } catch (error) {
    console.error("YooKassa create payment error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payment creation failed" },
      { status: 502 }
    );
  }
}
