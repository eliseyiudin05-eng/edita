import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";
export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>({}));const paymentId=String(body?.object?.id||"");
  const shop=process.env.YOOKASSA_SHOP_ID,secret=process.env.YOOKASSA_SECRET_KEY,service=getSupabaseServiceClient();
  if(!paymentId||!shop||!secret||!service)return NextResponse.json({ok:false},{status:400});
  const check=await fetch("https://api.yookassa.ru/v3/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:"Basic "+Buffer.from(shop+":"+secret).toString("base64")}});
  const payment=await check.json().catch(()=>({}));
  if(!check.ok||payment.status!=="succeeded")return NextResponse.json({ok:true});
  const {data:topup}=await service.from("point_topups").select("id,user_id,points,status").eq("provider_payment_id",paymentId).maybeSingle();
  if(!topup||topup.status==="succeeded")return NextResponse.json({ok:true});
  await service.from("point_topups").update({status:"succeeded",paid_at:new Date().toISOString()}).eq("id",topup.id).eq("status","pending");
  await service.from("work_wallets").upsert({user_id:topup.user_id},{onConflict:"user_id",ignoreDuplicates:true});
  await service.rpc("credit_work_points",{p_user:topup.user_id,p_topup:topup.id,p_points:topup.points});
  return NextResponse.json({ok:true});
}
