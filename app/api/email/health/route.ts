import {NextResponse} from "next/server";

export async function GET(){
  const key=process.env.RESEND_API_KEY;
  const expected=(process.env.RESEND_FROM_EMAIL||"no-reply@auth.getedita.app").match(/@([^>\s]+)/)?.[1]||"getedita.app";
  if(!key)return NextResponse.json({configured:false,connected:false,domain:expected,verified:false});

  try{
    const r=await fetch("https://api.resend.com/domains",{
      headers:{Authorization:"Bearer "+key},
      cache:"no-store"
    });
    const body=await r.json().catch(()=>({}));
    if(!r.ok)return NextResponse.json({configured:true,connected:false,domain:expected,verified:false,status:r.status});
    const domains=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
    const match=domains.find((d:any)=>d?.name===expected||expected.endsWith("."+d?.name));
    return NextResponse.json({
      configured:true,
      connected:true,
      domain:expected,
      verified:Boolean(match&&match.status==="verified"),
      domainStatus:match?.status||"not_found"
    });
  }catch{
    return NextResponse.json({configured:true,connected:false,domain:expected,verified:false,status:0});
  }
}
