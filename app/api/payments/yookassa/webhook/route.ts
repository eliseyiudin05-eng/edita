import { NextRequest, NextResponse } from "next/server";
import { yookassaRequest } from "@/lib/yookassa";
import { grantPaidAccess } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  try {
    const notification=await req.json();
    const objectId=notification?.object?.id;
    if(!objectId||typeof objectId!=="string"){
      return NextResponse.json({error:"Invalid notification"},{status:400});
    }

    const payment=await yookassaRequest("/payments/"+encodeURIComponent(objectId));
    if(payment.id!==objectId){
      return NextResponse.json({error:"Payment mismatch"},{status:400});
    }

    if(notification.event==="payment.succeeded"&&payment.status==="succeeded"){
      const access=await grantPaidAccess(payment);
      console.info("EDITA payment succeeded",{paymentId:payment.id,product:payment.metadata?.product,access});
    }

    if(notification.event==="payment.canceled"&&payment.status==="canceled"){
      console.info("EDITA payment canceled",{paymentId:payment.id});
    }

    return NextResponse.json({ok:true});
  } catch(error) {
    console.error("YooKassa webhook error",error);
    return NextResponse.json({error:"Webhook verification failed"},{status:502});
  }
}
