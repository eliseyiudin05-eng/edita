import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function tokenFrom(req:NextRequest){
  const bearer=req.headers.get("authorization");
  return bearer?.startsWith("Bearer ")?bearer.slice(7):null;
}

export async function GET(req:NextRequest){
  const user=await getUserFromAccessToken(tokenFrom(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const {data:profile}=await service.from("profiles").select("role,onboarding").eq("id",user.id).maybeSingle();
  if(profile?.role!=="business")return NextResponse.json({error:"Раздел доступен бизнес-аккаунту."},{status:403});

  let {data:business}=await service.from("businesses")
    .select("id,name,verified,verification_status,verification_level,verification_note,verified_at")
    .eq("owner_id",user.id).maybeSingle();

  if(!business){
    const name=(user.user_metadata?.display_name||user.email?.split("@")[0]||"Компания")+" — команда";
    const {data:created,error}=await service.from("businesses")
      .upsert({owner_id:user.id,name},{onConflict:"owner_id"})
      .select("id,name,verified,verification_status,verification_level,verification_note,verified_at")
      .single();
    if(error)return NextResponse.json({error:error.message},{status:500});
    business=created;
  }

  const {data:request}=await service.from("business_verification_requests")
    .select("id,requested_level,legal_name,inn,registration_number,website_url,social_url,reported_audience,status,review_note,created_at,reviewed_at")
    .eq("business_id",business.id)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();

  return NextResponse.json({business,request:request||null});
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(tokenFrom(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Нужен вход в аккаунт."},{status:401});

  const {data:profile}=await service.from("profiles").select("role,onboarding").eq("id",user.id).maybeSingle();
  if(profile?.role!=="business")return NextResponse.json({error:"Раздел доступен бизнес-аккаунту."},{status:403});

  const body=await req.json();
  const creatorAccount=profile?.onboarding?.accountKind==="creator"&&body?.creatorAccount===true;
  const requestedLevel=body?.requestedLevel==="popular_brand"?"popular_brand":"verified_company";
  const legalName=String(body?.legalName||"").trim().slice(0,180);
  const inn=String(body?.inn||"").replace(/\D/g,"").slice(0,12);
  const registrationNumber=String(body?.registrationNumber||"").replace(/\D/g,"").slice(0,15);
  const websiteUrl=String(body?.websiteUrl||"").trim().slice(0,500);
  const socialUrl=String(body?.socialUrl||"").trim().slice(0,500);
  const reportedAudience=body?.reportedAudience?Math.max(0,Math.floor(Number(body.reportedAudience))):null;
  const documentPaths=Array.isArray(body?.documentPaths)
    ? body.documentPaths.filter((v:any)=>typeof v==="string"&&v.startsWith(user.id+"/")).slice(0,3)
    : [];

  if(creatorAccount){
    if(!/^https:\/\//i.test(socialUrl))return NextResponse.json({error:"Добавь полную HTTPS-ссылку на открытый аккаунт."},{status:400});
  }else{
    if(!legalName)return NextResponse.json({error:"Напиши официальное название компании или ИП."},{status:400});
    if(!inn&&!registrationNumber)return NextResponse.json({error:"Укажи ИНН или ОГРН / ОГРНИП."},{status:400});
  }
  if(inn&&![10,12].includes(inn.length))return NextResponse.json({error:"ИНН должен состоять из 10 или 12 цифр."},{status:400});
  if(registrationNumber&&![13,15].includes(registrationNumber.length))return NextResponse.json({error:"ОГРН обычно содержит 13 цифр, ОГРНИП — 15."},{status:400});
  if(!creatorAccount&&documentPaths.length===0)return NextResponse.json({error:"Добавь хотя бы один документ для проверки."},{status:400});
  if(requestedLevel==="popular_brand"&&!websiteUrl&&!socialUrl){
    return NextResponse.json({error:"Для отметки «Известный бренд» добавь сайт или публичную страницу бренда."},{status:400});
  }

  let {data:business}=await service.from("businesses").select("id").eq("owner_id",user.id).maybeSingle();
  if(!business){
    const name=(user.user_metadata?.display_name||legalName||"Компания")+" — команда";
    const created=await service.from("businesses").upsert({owner_id:user.id,name},{onConflict:"owner_id"}).select("id").single();
    if(created.error)return NextResponse.json({error:created.error.message},{status:500});
    business=created.data;
  }

  const {data:request,error}=await service.from("business_verification_requests").insert({
    business_id:business.id,
    created_by:user.id,
    requested_level:requestedLevel,
    legal_name:creatorAccount?(user.user_metadata?.display_name||"Частный заказчик"):legalName,
    inn:inn||null,
    registration_number:registrationNumber||null,
    website_url:websiteUrl||null,
    social_url:socialUrl||null,
    reported_audience:reportedAudience,
    document_paths:documentPaths,
    status:"pending"
  }).select("id,status,requested_level,created_at").single();

  if(error)return NextResponse.json({error:error.message},{status:500});

  await service.from("businesses")
    .update({verification_status:"pending",verification_note:null})
    .eq("id",business.id);

  return NextResponse.json({ok:true,request});
}
