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

  const [{data:applications,error:aErr},{data:interest,error:iErr}]=await Promise.all([
    auth.service.from("creator_program_applications")
      .select("id,user_id,display_name,email,social_url,portfolio_url,preferred_format,desired_rate,note,status,created_at,reviewed_at")
      .order("created_at",{ascending:false}),
    auth.service.from("creator_brief_interest")
      .select("id,brief_id,user_id,email,social_url,message,status,created_at,creator_briefs(title,slug)")
      .order("created_at",{ascending:false})
  ]);

  if(aErr||iErr)return NextResponse.json({error:aErr?.message||iErr?.message},{status:500});
  return NextResponse.json({applications:applications||[],interest:interest||[]});
}

export async function POST(req:NextRequest){
  const auth=await requireAdmin(req);
  if(!auth)return NextResponse.json({error:"Нет доступа."},{status:403});
  const body=await req.json();
  const kind=body?.kind;
  const id=String(body?.id||"");
  const status=String(body?.status||"");
  const allowed=kind==="application"?["approved","rejected","paused","pending"]:["contacted","accepted","declined","interested"];
  if(!allowed.includes(status))return NextResponse.json({error:"Недопустимый статус."},{status:400});

  const table=kind==="application"?"creator_program_applications":"creator_brief_interest";
  const update:any={status};
  if(kind==="application"&&status!=="pending")update.reviewed_at=new Date().toISOString();

  const {error}=await auth.service.from(table).update(update).eq("id",id);
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true});
}
