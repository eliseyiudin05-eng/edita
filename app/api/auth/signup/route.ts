import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient} from "@/lib/server-supabase";
import {authEmailHtml,sendTransactionalEmail} from "@/lib/resend-email";
import {createHash} from "crypto";
import {isAcceptedAccessHash,isTesterAccessHash} from "@/lib/prelaunch-access";

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
  const schoolName=String(body?.schoolName||onboarding?.schoolName||"").trim().replace(/\s+/g," ").slice(0,160);
  const referralCode=String(body?.referralCode||"").trim().toUpperCase().slice(0,16);
  const accessCode=String(req.cookies.get("edita_prelaunch")?.value||"").trim().toUpperCase();
  const accessHash=createHash("sha256").update(accessCode).digest("hex");
  const testerAccess=isTesterAccessHash(accessHash);

  if(!validEmail(email))return NextResponse.json({error:"Проверь email."},{status:400});
  if(password.length<8)return NextResponse.json({error:"Пароль должен быть не короче 8 символов."},{status:400});
  if(!displayName)return NextResponse.json({error:"Укажи имя."},{status:400});
  if(schoolName&&schoolName.length<2)return NextResponse.json({error:"Название школы слишком короткое."},{status:400});
  if(!isAcceptedAccessHash(accessHash))return NextResponse.json({error:"Нужен действующий код закрытой беты."},{status:403});
  if(role==="business"&&(!businessName||onboarding?.ageGroup!=="18+")){
    return NextResponse.json({error:"Для бизнес-аккаунта нужно название компании и возраст 18+."},{status:400});
  }

  const site=process.env.NEXT_PUBLIC_SITE_URL||"https://getedita.app";
  const metadata={
    role,
    display_name:displayName,
    business_name:role==="business"?businessName:undefined,
    onboarding:{...onboarding,schoolName:schoolName||undefined,role},
    accepted_terms:true,
    accepted_personal_data:true,
    terms_version:"2026-09-12",
    privacy_version:"2026-09-12"
  };

  const authResult=testerAccess
    ?await service.auth.admin.createUser({
      email,
      password,
      email_confirm:true,
      user_metadata:metadata
    })
    :await service.auth.admin.generateLink({
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
      return NextResponse.json({error:"Аккаунт с таким email уже существует. Попробуй войти или восстановить пароль."},{status:409});
    }
    return NextResponse.json({error:"Не удалось создать аккаунт: "+error.message},{status:400});
  }

  const createdUserId=(data as any)?.user?.id;
  if(createdUserId){
    const profileUpdate:Record<string,string|null>={school_name:schoolName||null};
    const {error:profileError}=await service.from("profiles").update(profileUpdate).eq("id",createdUserId);
    if(profileError)console.error("Could not save signup profile extras",{code:profileError.code||"profile_update_failed"});
  }

  if(createdUserId&&testerAccess){
    const {data:invite}=await service.from("beta_access_codes")
      .select("id,program_id")
      .eq("code_hash",accessHash)
      .maybeSingle();
    if(!invite){
      await service.auth.admin.deleteUser(createdUserId);
      return NextResponse.json({error:"Бета-код не найден или выключен."},{status:403});
    }
    const {error:claimError}=await service.from("beta_members").insert({
      user_id:createdUserId,
      program_id:invite.program_id,
      access_code_id:invite.id
    });
    if(claimError){
      await service.auth.admin.deleteUser(createdUserId);
      const reason=String(claimError.message||"");
      const error=reason.includes("BETA_CAPACITY_REACHED")
        ?"Все 50 мест закрытой беты уже заняты."
        :reason.includes("BETA_PROGRAM_CLOSED")
          ?"Закрытая бета уже завершилась."
          :"Этот персональный код уже использован.";
      return NextResponse.json({error},{status:409});
    }
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

  if(testerAccess){
    return NextResponse.json({ok:true,email,instant:true});
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
    if(createdUserId){
      const {error:cleanupError}=await service.auth.admin.deleteUser(createdUserId);
      if(cleanupError)console.error("Could not clean up user after confirmation email failure",{code:cleanupError.code||"supabase_cleanup_failed"});
    }
    const code=e instanceof Error?e.message:"EMAIL_SEND_FAILED";
    return NextResponse.json({
      error:code==="RESEND_NOT_CONFIGURED"
        ?"Почтовый сервис EDITA ещё не подключён."
        :code==="RESEND_INVALID_KEY_FORMAT"
          ?"Ключ почтового сервиса настроен неверно."
        :"Не удалось отправить письмо подтверждения. Попробуй позже."
    },{status:503});
  }

  return NextResponse.json({ok:true,email});
}
