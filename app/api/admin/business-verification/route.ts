import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function tokenFrom(req:NextRequest){
  const bearer=req.headers.get("authorization");
  return bearer?.startsWith("Bearer ")?bearer.slice(7):null;
}

async function requireAdmin(req:NextRequest){
  const user=await getUserFromAccessToken(tokenFrom(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:profile}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profile?.role!=="admin")return null;
  return {user,service};
}

export async function GET(req:NextRequest){
  const auth=await requireAdmin(req);
  if(!auth)return NextResponse.json({error:"Нет доступа."},{status:403});

  const {data,error}=await auth.service.from("business_verification_requests")
    .select("id,business_id,requested_level,legal_name,inn,registration_number,website_url,social_url,reported_audience,document_paths,status,review_note,created_at,reviewed_at,businesses(name,verified,verification_level)")
    .in("status",["pending","needs_info"])
    .order("created_at",{ascending:true});
  if(error)return NextResponse.json({error:error.message},{status:500});

  const requests=await Promise.all((data||[]).map(async(row:any)=>{
    const documents=await Promise.all((row.document_paths||[]).map(async(path:string)=>{
      const {data:signed}=await auth.service.storage.from("business-verification").createSignedUrl(path,60*15);
      return {path,url:signed?.signedUrl||""};
    }));
    return {...row,documents,document_paths:undefined};
  }));

  return NextResponse.json({requests});
}

export async function POST(req:NextRequest){
  const auth=await requireAdmin(req);
  if(!auth)return NextResponse.json({error:"Нет доступа."},{status:403});

  const body=await req.json();
  const requestId=String(body?.requestId||"");
  const action=body?.action;
  const note=String(body?.note||"").trim().slice(0,1000);

  const {data:request}=await auth.service.from("business_verification_requests")
    .select("id,business_id,requested_level,status")
    .eq("id",requestId).maybeSingle();
  if(!request)return NextResponse.json({error:"Заявка отсутствует."},{status:404});

  if(action==="approve"){
    const level=body?.level==="popular_brand"?"popular_brand":"verified_company";
    const now=new Date().toISOString();
    const {error:a}=await auth.service.from("business_verification_requests")
      .update({status:"approved",review_note:note||null,reviewed_at:now})
      .eq("id",request.id);
    if(a)return NextResponse.json({error:a.message},{status:500});

    const {error:b}=await auth.service.from("businesses").update({
      verified:true,
      verification_status:"approved",
      verification_level:level,
      verification_note:note||null,
      verified_at:now
    }).eq("id",request.business_id);
    if(b)return NextResponse.json({error:b.message},{status:500});
    return NextResponse.json({ok:true,status:"approved",level});
  }

  if(action==="needs_info"||action==="reject"){
    const status=action==="reject"?"rejected":"needs_info";
    const {error:a}=await auth.service.from("business_verification_requests")
      .update({status,review_note:note||"Нужно уточнение.",reviewed_at:new Date().toISOString()})
      .eq("id",request.id);
    if(a)return NextResponse.json({error:a.message},{status:500});
    await auth.service.from("businesses").update({
      verified:false,
      verification_status:status==="rejected"?"rejected":"pending",
      verification_note:note||"Нужно уточнение."
    }).eq("id",request.business_id);
    return NextResponse.json({ok:true,status});
  }

  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
