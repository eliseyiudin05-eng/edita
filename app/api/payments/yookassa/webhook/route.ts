import { NextRequest, NextResponse } from "next/server";
import { yookassaRequest } from "@/lib/yookassa";

export async function POST(req: NextRequest) {
  try {
    const notification = await req.json();
    const objectId = notification?.object?.id;

    if (!objectId || typeof objectId !== "string") {
      return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
    }

    // YooKassa HTTP notifications are verified server-to-server by fetching
    // the payment again with our own shop credentials. Never trust the
    // notification body alone for granting access.
    const payment = await yookassaRequest("/payments/" + encodeURIComponent(objectId));

    if (payment.id !== objectId) {
      return NextResponse.json({ error: "Payment mismatch" }, { status: 400 });
    }

    if (notification.event === "payment.succeeded" && payment.status === "succeeded") {
      console.info("EDITA payment succeeded", {
        paymentId: payment.id,
        product: payment.metadata?.product,
        orderId: payment.metadata?.order_id,
        amount: payment.amount,
      });
      // TODO: when EDITA production DB is connected:
      // upsert payment + grant entitlement idempotently by payment.id.
    }

    if (notification.event === "payment.canceled" && payment.status === "canceled") {
      console.info("EDITA payment canceled", { paymentId: payment.id });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("YooKassa webhook error", error);
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 502 });
  }
}
