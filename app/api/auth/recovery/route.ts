import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";
import {authEmailHtml,sendTransactionalEmail} from "@/lib/resend-email";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";

export async function POST(req:NextRequest){
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({ok:true});

  const body=await req.json().catch(()=>({}));
  const email=String(body?.email||"").trim().toLowerCase();
  if(!email.includes("@"))return NextResponse.json({ok:true});

  const site=KIVRONIX_SITE_URL;
  const {data,error}=await service.auth.admin.generateLink({
    type:"recovery",
    email,
    options:{redirectTo:site+"/reset-password"}
  });

  // Do not reveal whether an account exists.
  if(error)return NextResponse.json({ok:true});

  const link=(data as any)?.properties?.action_link||(data as any)?.properties?.actionLink;
  if(!link)return NextResponse.json({ok:true});

  try{
    await sendTransactionalEmail({
      to:email,
      subject:"Новый пароль для KIVRONIX",
      html:authEmailHtml(
        "Создай новый пароль",
        "Мы получили запрос на смену пароля. Нажми кнопку ниже. Ссылка одноразовая.",
        "Создать новый пароль",
        link
      ),
      text:"Ссылка для смены пароля KIVRONIX: "+link
    });
  }catch{
    return NextResponse.json({error:"Почта временно недоступна. Попробуй чуть позже."},{status:503});
  }

  return NextResponse.json({ok:true});
}
