import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";
import {authEmailHtml,sendTransactionalEmail} from "@/lib/resend-email";

export async function POST(req:NextRequest){
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({error:"Сервис временно недоступен."},{status:503});
  const body=await req.json().catch(()=>({}));
  const email=String(body?.email||"").trim().toLowerCase();
  if(!email.includes("@"))return NextResponse.json({error:"Проверь электронную почту."},{status:400});

  const site=process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin;
  const {data,error}=await service.auth.admin.generateLink({
    type:"magiclink",
    email,
    options:{redirectTo:site+"/platform"}
  });

  // Do not reveal account existence.
  if(error)return NextResponse.json({ok:true});

  const link=(data as any)?.properties?.action_link||(data as any)?.properties?.actionLink;
  if(!link)return NextResponse.json({ok:true});

  try{
    await sendTransactionalEmail({
      to:email,
      subject:"Подтверди электронную почту в KIVRONIX",
      html:authEmailHtml(
        "Подтверди электронную почту",
        "Нажми кнопку ниже. После подтверждения откроется твой аккаунт KIVRONIX.",
        "Подтвердить и войти",
        link
      ),
      text:"Подтверди электронную почту KIVRONIX: "+link
    });
  }catch{
    return NextResponse.json({error:"Ошибка отправки письма. Попробуй позже."},{status:503});
  }
  return NextResponse.json({ok:true});
}
