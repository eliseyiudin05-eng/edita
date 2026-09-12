import {NextRequest,NextResponse} from "next/server";
import {createHash} from "crypto";
import {isAcceptedAccessHash,isTesterAccessHash} from "@/lib/prelaunch-access";
import {getSupabaseServiceClient} from "@/lib/server-supabase";

export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>({}));
  const code=String(body?.code||"").trim().toUpperCase();
  const hash=createHash("sha256").update(code).digest("hex");

  if(!isAcceptedAccessHash(hash)){
    return NextResponse.json({error:"Код не подошёл. Проверь символы и попробуй ещё раз."},{status:401});
  }

  if(isTesterAccessHash(hash)){
    const service=getSupabaseServiceClient();
    if(!service)return NextResponse.json({error:"Проверка бета-кода временно недоступна."},{status:503});
    const {data:invite,error}=await service.from("beta_access_codes")
      .select("id,active,expires_at")
      .eq("code_hash",hash)
      .maybeSingle();
    if(error||!invite||!invite.active||(invite.expires_at&&new Date(invite.expires_at).getTime()<=Date.now())){
      return NextResponse.json({error:"Этот бета-код выключен или срок его действия закончился."},{status:401});
    }
  }

  const res=NextResponse.json({ok:true});
  res.cookies.set("edita_prelaunch",code,{
    httpOnly:true,
    secure:true,
    sameSite:"lax",
    path:"/",
    maxAge:60*60*24*30
  });
  return res;
}
