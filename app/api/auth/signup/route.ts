import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";
import {authEmailHtml,sendTransactionalEmail} from "@/lib/resend-email";

function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}

export async function POST(req:NextRequest){
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({error:"Серверная регистрация не настроена."},{status:503});

  const body=await req.json().catch(()=>({}));
  const email=String(body?.email||"").trim().toLowerCase();
  const password=String(body?.password||"");
  const role=body?.role==="business"?"business":"editor";
  const displayName=String(body?.displayName||"").trim().slice(0,120);
  const businessName=String(body?.businessName||"").trim().slice(0,160);
  const onboarding=body?.onboarding&&typeof body.onboarding==="object"?body.onboarding:{};
  const referralCode=String(body?.referralCode||"").trim().toUpperCase().slice(0,16);

  if(!validEmail(email))return NextResponse.json({error:"Проверь email."},{status:400});
  if(password.length<8)return NextResponse.json({error:"Пароль должен быть не короче 8 символов."},{status:400});
  if(!displayName)return NextResponse.json({error:"Укажи имя."},{status:400});
  if(role==="business"&&(!businessName||onboarding?.ageGroup!=="18+")){
    return NextResponse.json({error:"Для бизнес-аккаунта нужно название компании и возраст 18+."},{status:400});
  }

  const site=process.env.NEXT_PUBLIC_SITE_URL||"https://getedita.app";
  const metadata={
    role,
    display_name:displayName,
    business_name:role==="business"?businessName:undefined,
    onboarding:{...onboarding,role},
    accepted_terms:true,
    accepted_personal_data:true,
    terms_version:"2026-09-12",
    privacy_version:"2026-09-12"
  };

  const {data,error}=await service.auth.admin.generateLink({
    type:"signup",
    email,
    password,
    options:{
      data:metadata,
      redirectTo:site+"/platform"
    }
  });

  if(error){
    const msg=error.message.toLowerCase();
    if(msg.includes("already")||msg.includes("registered")){
      return NextResponse.json({error:"Аккаунт с таким email уже существует. Попробуй войти или восстановить пароль."},{status:409});
    }
    return NextResponse.json({error:"Не удалось создать аккаунт: "+error.message},{status:400});
  }

  const createdUserId=(data as any)?.user?.id;
  if(role==="editor"&&referralCode&&createdUserId){
    const {data:referrer}=await service.from("profiles")
      .select("id,referral_code")
      .eq("referral_code",referralCode)
      .maybeSingle();
    if(referrer?.id&&referrer.id!==createdUserId){
      await service.from("referrals").upsert({
        referrer_id:referrer.id,
        referred_id:createdUserId,
        referral_code:referralCode,
        status:"pending"
      },{onConflict:"referred_id"});
    }
  }

  const link=(data as any)?.properties?.action_link||(data as any)?.properties?.actionLink;
  if(!link)return NextResponse.json({error:"Не удалось создать ссылку подтверждения."},{status:500});

  try{
    await sendTransactionalEmail({
      to:email,
      subject:"Подтверди email в EDITA",
      html:authEmailHtml(
        "Подтверди email",
        "Нажми кнопку ниже, чтобы подтвердить адрес и открыть свой аккаунт EDITA.",
        "Подтвердить email",
        link
      ),
      text:"Подтверди email EDITA: "+link
    });
  }catch(e){
    if(createdUserId)await service.auth.admin.deleteUser(createdUserId).catch(()=>{});
    const code=e instanceof Error?e.message:"EMAIL_SEND_FAILED";
    return NextResponse.json({
      error:code==="RESEND_NOT_CONFIGURED"
        ?"Почтовый сервис EDITA ещё не подключён."
        :"Не удалось отправить письмо подтверждения. Попробуй позже."
    },{status:503});
  }

  return NextResponse.json({ok:true,email});
}
