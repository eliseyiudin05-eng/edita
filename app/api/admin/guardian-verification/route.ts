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
  return {service};
}

export async function GET(req:NextRequest){
  const auth=await requireAdmin(req);
  if(!auth)return NextResponse.json({error:"Нет доступа."},{status:403});

  const {data,error}=await auth.service.from("guardian_verification_requests")
    .select("id,user_id,guardian_name,guardian_email,relationship,method,status,review_note,created_at,reviewed_at")
    .in("status",["pending","needs_info"])
    .order("created_at",{ascending:true});
  if(error)return NextResponse.json({error:error.message},{status:500});

  const ids=[...new Set((data||[]).map((r:any)=>r.user_id))];
  const {data:profiles}=ids.length
    ? await auth.service.from("profiles").select("id,display_name,username,onboarding").in("id",ids)
    : {data:[] as any[]};
  const profileMap=Object.fromEntries((profiles||[]).map((p:any)=>[p.id,p]));

  return NextResponse.json({requests:(data||[]).map((r:any)=>({...r,profile:profileMap[r.user_id]||null}))});
}

export async function POST(req:NextRequest){
  const auth=await requireAdmin(req);
  if(!auth)return NextResponse.json({error:"Нет доступа."},{status:403});

  const body=await req.json();
  const requestId=String(body?.requestId||"");
  const action=body?.action;
  const note=String(body?.note||"").trim().slice(0,1000);

  const {data:request}=await auth.service.from("guardian_verification_requests")
    .select("id,user_id,status").eq("id",requestId).maybeSingle();
  if(!request)return NextResponse.json({error:"Заявка отсутствует."},{status:404});

  if(action==="approve"){
    const now=new Date().toISOString();
    const {error:a}=await auth.service.from("guardian_verification_requests")
      .update({status:"approved",review_note:note||null,reviewed_at:now}).eq("id",request.id);
    if(a)return NextResponse.json({error:a.message},{status:500});

    const {error:b}=await auth.service.from("profiles")
      .update({guardian_verified:true}).eq("id",request.user_id);
    if(b)return NextResponse.json({error:b.message},{status:500});
    return NextResponse.json({ok:true,status:"approved"});
  }

  if(action==="needs_info"||action==="reject"){
    const status=action==="reject"?"rejected":"needs_info";
    const {error}=await auth.service.from("guardian_verification_requests")
      .update({status,review_note:note||"Нужно уточнение.",reviewed_at:new Date().toISOString()})
      .eq("id",request.id);
    if(error)return NextResponse.json({error:error.message},{status:500});
    await auth.service.from("profiles").update({guardian_verified:false}).eq("id",request.user_id);
    return NextResponse.json({ok:true,status});
  }

  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
