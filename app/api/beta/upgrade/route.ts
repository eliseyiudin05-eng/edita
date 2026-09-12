import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

export async function POST(req:NextRequest){
  const bearer=req.headers.get("authorization");
  const token=bearer?.startsWith("Bearer ")?bearer.slice(7):null;
  const user=await getUserFromAccessToken(token);
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({error:"Сначала войди в аккаунт."},{status:401});

  const {data:membership}=await service.from("beta_members")
    .select("program_id")
    .eq("user_id",user.id)
    .maybeSingle();
  if(!membership)return NextResponse.json({error:"Бесплатный PRO доступен участникам закрытой беты по персональному коду."},{status:403});

  const {data:program}=await service.from("beta_programs")
    .select("id,ends_at,active")
    .eq("id",membership.program_id)
    .eq("active",true)
    .lte("starts_at",new Date().toISOString())
    .order("starts_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(!program||!program.active||(program.ends_at&&new Date(program.ends_at).getTime()<=Date.now())){
    return NextResponse.json({error:"Бесплатная бета уже завершилась."},{status:403});
  }

  const expiresAt=program.ends_at||new Date(Date.now()+30*86400000).toISOString();
  const {error}=await service.from("profiles").update({plan:"pro",plan_expires_at:expiresAt}).eq("id",user.id);
  if(error)return NextResponse.json({error:"Не удалось включить PRO."},{status:500});
  return NextResponse.json({ok:true,plan:"pro",expiresAt});
}
