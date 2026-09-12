import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}
async function admin(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return null;
  const {data:p}=await service.from("profiles").select("role").eq("id",user.id).maybeSingle();
  return p?.role==="admin"?service:null;
}

export async function GET(req:NextRequest){
  const service=await admin(req);
  if(!service)return NextResponse.json({error:"Нет доступа."},{status:403});
  const {data,error}=await service.from("editor_verification_requests")
    .select("id,user_id,portfolio_url,sample_url,note,status,review_note,created_at,profiles(display_name,username,onboarding)")
    .in("status",["pending","needs_info"])
    .order("created_at",{ascending:true});
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({requests:data||[]});
}

export async function POST(req:NextRequest){
  const service=await admin(req);
  if(!service)return NextResponse.json({error:"Нет доступа."},{status:403});
  const body=await req.json().catch(()=>({}));
  const id=String(body?.id||"");
  const action=String(body?.action||"");
  const note=String(body?.note||"").trim().slice(0,1000);
  const {data:row}=await service.from("editor_verification_requests").select("id,user_id").eq("id",id).maybeSingle();
  if(!row)return NextResponse.json({error:"Заявка отсутствует."},{status:404});

  if(action==="approve"){
    await service.from("editor_verification_requests").update({status:"approved",review_note:note||null,reviewed_at:new Date().toISOString()}).eq("id",id);
    await service.from("profiles").update({editor_verification_level:"skills_verified"}).eq("id",row.user_id);
    return NextResponse.json({ok:true});
  }
  if(action==="needs_info"||action==="reject"){
    const status=action==="reject"?"rejected":"needs_info";
    await service.from("editor_verification_requests").update({status,review_note:note||"Нужно уточнение.",reviewed_at:new Date().toISOString()}).eq("id",id);
    return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Неизвестное действие."},{status:400});
}
