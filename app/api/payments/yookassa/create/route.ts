import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createPayment, PRODUCTS, type EditaProduct } from "@/lib/yookassa";
import { getSupabaseServiceClient, getUserFromAccessToken } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const product = body?.product as EditaProduct;
    if (!PRODUCTS[product]) return NextResponse.json({ error: "Unknown product" }, { status: 400 });

    const bearer=req.headers.get("authorization");
    const accessToken=bearer?.startsWith("Bearer ")?bearer.slice(7):null;
    const user=await getUserFromAccessToken(accessToken);

    if(!user){
      return NextResponse.json({error:"Войди в EDITA перед оплатой, чтобы доступ привязался к твоему аккаунту."},{status:401});
    }

    const service=getSupabaseServiceClient();
    if(service){
      const {data:profile}=await service.from("profiles")
        .select("onboarding,guardian_verified")
        .eq("id",user.id).maybeSingle();
      const ageGroup=profile?.onboarding?.ageGroup||"18+";
      if(ageGroup!=="18+"&&!profile?.guardian_verified){
        return NextResponse.json({error:"Для оплаты пользователю младше 18 лет сначала нужно подтверждение родителя или законного представителя."},{status:403});
      }
    }

    const customerEmail=user?.email||
      (typeof body?.email==="string"&&body.email.includes("@")?body.email.trim():undefined);
    const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||req.nextUrl.origin;

    const {data,orderId}=await createPayment({
      product,
      customerEmail,
      userId:user?.id,
      returnUrl:siteUrl+"/payment/return",
    });

    const confirmationUrl=data?.confirmation?.confirmation_url;
    if(!data?.id||!confirmationUrl){
      return NextResponse.json({error:"YooKassa did not return confirmation URL"},{status:502});
    }

    const cookieStore=await cookies();
    cookieStore.set("edita_last_payment_id",data.id,{httpOnly:true,secure:true,sameSite:"lax",maxAge:60*60*2,path:"/"});
    cookieStore.set("edita_last_product",product,{httpOnly:true,secure:true,sameSite:"lax",maxAge:60*60*2,path:"/"});

    return NextResponse.json({paymentId:data.id,orderId,confirmationUrl});
  } catch(error) {
    console.error("YooKassa create payment error",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Payment creation failed"},{status:502});
  }
}
