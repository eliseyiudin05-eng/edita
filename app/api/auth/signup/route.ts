import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";
import {authEmailHtml,sendTransactionalEmail} from "@/lib/resend-email";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";

function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}

export async function POST(req:NextRequest){
  const service=getSupabaseServiceClient();
  if(!service)return NextResponse.json({error:"Сервер регистрации ждёт настройки."},{status:503});

  const body=await req.json().catch(()=>({}));
  const email=String(body?.email||"").trim().toLowerCase();
  const password=String(body?.password||"");
  const role=body?.role==="business"?"business":"editor";
  const displayName=String(body?.displayName||"").trim().slice(0,120);
  const businessName=String(body?.businessName||"").trim().slice(0,160);
  const onboarding=body?.onboarding&&typeof body.onboarding==="object"?body.onboarding:{};
  const schoolName=String(body?.schoolName||onboarding?.schoolName||"").trim().replace(/\s+/g," ").slice(0,160);
  const referralCode=String(body?.referralCode||"").trim().toUpperCase().slice(0,16);
  const motivation=String(onboarding?.motivation||"").trim().slice(0,500);

  if(!validEmail(email))return NextResponse.json({error:"Проверь электронную почту."},{status:400});
  if(password.length<8)return NextResponse.json({error:"Пароль должен содержать 8 символов или больше."},{status:400});
  if(!displayName)return NextResponse.json({error:"Укажи имя."},{status:400});
  if(role==="editor"&&motivation.length<5)return NextResponse.json({error:"Напиши, почему хочешь стать монтажёром."},{status:400});
  if(schoolName&&schoolName.length<2)return NextResponse.json({error:"Название школы слишком короткое."},{status:400});
  if(role==="business"&&(!businessName||onboarding?.ageGroup!=="18+")){
    return NextResponse.json({error:"Для бизнес-аккаунта нужно название компании и возраст 18+."},{status:400});
  }

  const site=KIVRONIX_SITE_URL;
  const metadata={
    role,
    display_name:displayName,
    business_name:role==="business"?businessName:undefined,
    onboarding:{...onboarding,motivation:role==="editor"?motivation:undefined,schoolName:schoolName||undefined,role},
    accepted_terms:true,
    accepted_personal_data:true,
    terms_version:"2026-09-12",
    privacy_version:"2026-09-12"
  };

  const authResult=await service.auth.admin.generateLink({
    type:"signup",
    email,
    password,
    options:{
      data:metadata,
      redirectTo:site+"/platform"
    }
  });
  const {data,error}=authResult as any;

  if(error){
    const msg=error.message.toLowerCase();
    if(msg.includes("already")||msg.includes("registered")){
      return NextResponse.json({error:"Аккаунт с такой электронной почтой уже существует. Попробуй войти или восстановить пароль."},{status:409});
    }
    return NextResponse.json({error:"Ошибка создания аккаунта: "+error.message},{status:400});
  }

  const createdUserId=(data as any)?.user?.id;
  if(createdUserId){
    const profileUpdate:Record<string,unknown>={
      school_name:schoolName||null,
      onboarding:metadata.onboarding,
      ...(role==="editor"?{referral_points:5}:{})
    };
    const {error:profileError}=await service.from("profiles").update(profileUpdate).eq("id",createdUserId);
    if(profileError)console.error("Could not save signup profile extras",{code:profileError.code||"profile_update_failed"});
  }

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
  if(!link)return NextResponse.json({error:"Ошибка создания ссылки подтверждения."},{status:500});

  try{
    await sendTransactionalEmail({
      to:email,
      subject:"Подтверди электронную почту в KIVRONIX",
      html:authEmailHtml(
        "Подтверди электронную почту",
        "Нажми кнопку ниже, чтобы подтвердить адрес и открыть свой аккаунт KIVRONIX.",
        "Подтвердить почту",
        link
      ),
      text:"Подтверди электронную почту KIVRONIX: "+link
    });
  }catch(e){
    if(createdUserId){
      const {error:cleanupError}=await service.auth.admin.deleteUser(createdUserId);
      if(cleanupError)console.error("Could not clean up user after confirmation email failure",{code:cleanupError.code||"supabase_cleanup_failed"});
    }
    const code=e instanceof Error?e.message:"EMAIL_SEND_FAILED";
    return NextResponse.json({
      error:code==="RESEND_NOT_CONFIGURED"
        ?"Почтовый сервис KIVRONIX ждёт настройки."
        :code==="RESEND_INVALID_KEY_FORMAT"
          ?"Ключ почтового сервиса настроен неверно."
        :"Ошибка отправки письма. Попробуй позже."
    },{status:503});
  }

  return NextResponse.json({ok:true,email});
}
