import {NextRequest,NextResponse} from "next/server";

function backendURL(path:string){
  const configured=process.env.GO_BACKEND_URL?.trim();
  if(!configured)return null;
  try{
    const base=new URL(configured);
    if(!["http:","https:"].includes(base.protocol)||base.username||base.password)return null;
    return new URL(path,base).toString();
  }catch{return null;}
}

export async function proxyToGo(req:NextRequest,path:string){
  const target=backendURL(path);
  if(!target)return NextResponse.json({error:"Go API не настроен."},{status:503});
  const authorization=req.headers.get("authorization");
  if(!authorization?.startsWith("Bearer "))return NextResponse.json({error:"Войдите в аккаунт."},{status:401});
  const headers:Record<string,string>={Authorization:authorization,Accept:"application/json"};
  let body:string|undefined;
  if(req.method!=="GET"){
    headers["Content-Type"]="application/json";
    body=await req.text();
  }
  try{
    const response=await fetch(target,{method:req.method,headers,body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(6000)});
    return new NextResponse(await response.text(),{status:response.status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Go API временно недоступен."},{status:503});}
}
