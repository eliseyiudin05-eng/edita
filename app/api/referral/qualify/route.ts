import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){const v=req.headers.get("authorization");return v?.startsWith("Bearer ")?v.slice(7):null}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({ok:false},{status:401});
  if(!user.email_confirmed_at)return NextResponse.json({ok:true,qualified:false});

  const {data:ref}=await service.from("referrals").select("id,status").eq("referred_user_id",user.id).maybeSingle();
  if(!ref||ref.status!=="signup")return NextResponse.json({ok:true,qualified:ref?.status==="qualified"});

  const {count}=await service.from("lesson_progress").select("lesson_id",{count:"exact",head:true}).eq("user_id",user.id).eq("status","completed");
  if((count||0)<1)return NextResponse.json({ok:true,qualified:false});

  const {error}=await service.from("referrals").update({status:"qualified",qualified_at:new Date().toISOString()}).eq("id",ref.id).eq("status","signup");
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,qualified:true});
}
