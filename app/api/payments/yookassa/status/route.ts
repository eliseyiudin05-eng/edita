import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PRODUCTS, yookassaRequest, type EditaProduct } from "@/lib/yookassa";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const paymentId = cookieStore.get("edita_last_payment_id")?.value;
    const product = cookieStore.get("edita_last_product")?.value as EditaProduct | undefined;

    if (!paymentId) {
      return NextResponse.json({ error: "No payment session" }, { status: 404 });
    }

    const payment = await yookassaRequest("/payments/" + encodeURIComponent(paymentId));
    const productInfo = product && PRODUCTS[product] ? PRODUCTS[product] : null;

    return NextResponse.json({
      id: payment.id,
      status: payment.status,
      paid: Boolean(payment.paid),
      amount: payment.amount,
      product: product || payment.metadata?.product || null,
      productName: productInfo?.name || payment.description || null,
      test: Boolean(payment.test),
    });
  } catch (error) {
    console.error("YooKassa payment status error", error);
    return NextResponse.json({ error: "Could not verify payment" }, { status: 502 });
  }
}
