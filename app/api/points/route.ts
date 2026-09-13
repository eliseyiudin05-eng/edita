import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "crypto";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";
function token(req:NextRequest){const h=req.headers.get("authorization");return h?.startsWith("Bearer ")?h.slice(7):null}
export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  await service.from("work_wallets").upsert({user_id:user.id},{onConflict:"user_id",ignoreDuplicates:true});
  const {data}=await service.from("work_wallets").select("available_points,reserved_points").eq("user_id",user.id).single();
  return NextResponse.json({available:Number(data?.available_points||0),reserved:Number(data?.reserved_points||0),topupFeePercent:5,workFeePercent:0});
}
export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход."},{status:401});
  const points=Math.floor(Number((await req.json().catch(()=>({})))?.points)||0);
  if(points<100||points>1000000)return NextResponse.json({error:"Пополнение — от 100 до 1 000 000 Points."},{status:400});
  const shop=process.env.YOOKASSA_SHOP_ID,secret=process.env.YOOKASSA_SECRET_KEY;
  if(!shop||!secret)return NextResponse.json({error:"Безопасное пополнение готово технически, но ключ ЮKassa ещё не подключён."},{status:503});
  const amountCents=Math.round(points*105);
  const {data:topup,error}=await service.from("point_topups").insert({user_id:user.id,points,amount_cents:amountCents}).select("id").single();
  if(error)return NextResponse.json({error:"Не удалось создать пополнение."},{status:500});
  const payment=await fetch("https://api.yookassa.ru/v3/payments",{method:"POST",headers:{"Content-Type":"application/json","Idempotence-Key":randomUUID(),Authorization:"Basic "+Buffer.from(shop+":"+secret).toString("base64")},body:JSON.stringify({amount:{value:(amountCents/100).toFixed(2),currency:"RUB"},capture:true,confirmation:{type:"redirect",return_url:KIVRONIX_SITE_URL+"/platform#wallet"},description:`${points} KIVRONIX Points + комиссия пополнения 5%`,metadata:{topup_id:topup.id,user_id:user.id,points:String(points),topup_fee_percent:"5"}})});
  const data=await payment.json().catch(()=>({}));
  if(!payment.ok||!data?.id||!data?.confirmation?.confirmation_url)return NextResponse.json({error:"ЮKassa не создала платёж."},{status:502});
  await service.from("point_topups").update({provider_payment_id:data.id}).eq("id",topup.id);
  return NextResponse.json({url:data.confirmation.confirmation_url});
}
