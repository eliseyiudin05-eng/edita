import {NextRequest,NextResponse} from "next/server";
import {createHash} from "crypto";

const ACCESS_HASH="bfc66c41fc002c17d37c9649cce339179454851d26591ccae64b489df56ff3e1";

export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>({}));
  const code=String(body?.code||"").trim().toUpperCase();
  const hash=createHash("sha256").update(code).digest("hex");

  if(hash!==ACCESS_HASH){
    return NextResponse.json({error:"Код не подошёл. Проверь символы и попробуй ещё раз."},{status:401});
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
