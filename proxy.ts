import {NextRequest,NextResponse} from "next/server";
import {isAcceptedAccessHash} from "@/lib/prelaunch-access";

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export default async function proxy(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(process.env.NODE_ENV==="development"){
    return NextResponse.next();
  }
  if(
    path==="/prelaunch"||
    path==="/api/prelaunch"||
    path==="/api/email/health"||
    path.startsWith("/_next/")||
    path==="/favicon.ico"||
    path==="/robots.txt"
  ){
    return NextResponse.next();
  }

  const code=req.cookies.get("edita_prelaunch")?.value||"";
  if(code && isAcceptedAccessHash(await sha256(code.trim().toUpperCase()))){
    return NextResponse.next();
  }

  if(path.startsWith("/api/")){
    return NextResponse.json({error:"EDITA сейчас в закрытом предзапуске."},{status:401});
  }

  const url=req.nextUrl.clone();
  url.pathname="/prelaunch";
  url.searchParams.set("from",path==="/"?"/review-access":path);
  return NextResponse.redirect(url);
}

export const config={
  matcher:["/((?!.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?)$).*)"]
};
