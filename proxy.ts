import {NextRequest,NextResponse} from "next/server";

const ACCESS_HASH="bfc66c41fc002c17d37c9649cce339179454851d26591ccae64b489df56ff3e1";

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export default async function proxy(req:NextRequest){
  const path=req.nextUrl.pathname;
  if(
    path==="/prelaunch"||
    path==="/api/prelaunch"||
    path.startsWith("/_next/")||
    path==="/favicon.ico"||
    path==="/robots.txt"
  ){
    return NextResponse.next();
  }

  const code=req.cookies.get("edita_prelaunch")?.value||"";
  if(code && await sha256(code)===ACCESS_HASH){
    return NextResponse.next();
  }

  if(path.startsWith("/api/")){
    return NextResponse.json({error:"EDITA сейчас в закрытом предзапуске."},{status:401});
  }

  const url=req.nextUrl.clone();
  url.pathname="/prelaunch";
  url.searchParams.set("from",path);
  return NextResponse.redirect(url);
}

export const config={
  matcher:["/((?!.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?)$).*)"]
};
