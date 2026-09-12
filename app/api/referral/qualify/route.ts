import {NextRequest,NextResponse} from "next/server";
import {getSupabaseServiceClient,getUserFromAccessToken} from "@/lib/server-supabase";

function token(req:NextRequest){
  const h=req.headers.get("authorization");
  return h?.startsWith("Bearer ")?h.slice(7):null;
}

export async function POST(req:NextRequest){
  const user=await getUserFromAccessToken(token(req));
  const service=getSupabaseServiceClient();
  if(!user||!service)return NextResponse.json({ok:false},{status:401});
  if(!user.email_confirmed_at)return NextResponse.json({ok:true,qualified:false,reason:"email"});

  const {data:ref}=await service.from("referrals").select("id,status").eq("referred_id",user.id).maybeSingle();
  if(!ref||ref.status!=="pending")return NextResponse.json({ok:true,qualified:ref?.status==="qualified"});

  const {count}=await service.from("lesson_progress").select("lesson_id",{count:"exact",head:true})
    .eq("user_id",user.id).eq("status","completed");
  if((count||0)<3)return NextResponse.json({ok:true,qualified:false,reason:"lessons",completed:count||0});

  const {error}=await service.from("referrals")
    .update({status:"qualified",qualified_at:new Date().toISOString()})
    .eq("id",ref.id).eq("status","pending");
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true,qualified:true});
}
