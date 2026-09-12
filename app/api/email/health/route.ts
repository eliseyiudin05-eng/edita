import {NextResponse} from "next/server";
import {getResendServiceStatus} from "@/lib/resend-email";

const domain="auth.getedita.app";
const expected={
  dkim:{
    name:"resend._domainkey.auth.getedita.app",
    value:"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXHmHRZdSl6kJr4g3iwEJP+PZsUpOBGTTCyT4jkL+d9v6mIqx0NoH0QJGFFLQsF6eeGGBWt2Unz06N0IeOzKQGeMGzDVlBqG013ZrAbZPY+va5YSNBvkl6DwJnD6yKx5TKJwtRSWGvjY2SbJaVohKcNQjNvK41Wd7zjEgZpCSeXQIDAQAB"
  },
  spf:{
    name:"send.auth.getedita.app",
    value:"v=spf1 include:amazonses.com ~all"
  },
  mx:{
    name:"send.auth.getedita.app",
    value:"feedback-smtp.eu-west-1.amazonses.com"
  },
  cname:{
    name:"rsend.auth.getedita.app",
    value:"send.forge.rmta.net"
  }
};

async function dns(name:string,type:"TXT"|"MX"|"CNAME"){
  try{
    const r=await fetch("https://dns.google/resolve?name="+encodeURIComponent(name)+"&type="+type,{
      cache:"no-store",
      headers:{accept:"application/dns-json"}
    });
    if(!r.ok)return [];
    const body=await r.json();
    return Array.isArray(body?.Answer)?body.Answer.map((a:any)=>String(a?.data||"").replace(/^"|"$/g,"").replace(/\\"/g,'"')):[];
  }catch{return []}
}

export async function GET(){
  const [resend,dkim,spf,mx,cname]=await Promise.all([
    getResendServiceStatus(),
    dns(expected.dkim.name,"TXT"),
    dns(expected.spf.name,"TXT"),
    dns(expected.mx.name,"MX"),
    dns(expected.cname.name,"CNAME")
  ]);

  const checks={
    dkim:dkim.some((v:string)=>v.includes(expected.dkim.value)),
    spf:spf.some((v:string)=>v.includes(expected.spf.value)),
    mx:mx.some((v:string)=>v.toLowerCase().includes(expected.mx.value.toLowerCase())),
    cname:cname.some((v:string)=>v.toLowerCase().replace(/\.$/,"")===expected.cname.value.toLowerCase())
  };
  const dnsVerified=Object.values(checks).every(Boolean);

  return NextResponse.json({
    configured:resend.configured,
    connected:resend.connected,
    domain,
    verified:resend.verified&&dnsVerified,
    domainStatus:resend.domainStatus,
    apiStatus:resend.apiStatus,
    errorCode:resend.errorCode,
    keyFormatValid:resend.keyFormatValid,
    sendingEnabled:resend.sendingEnabled,
    senderAdjusted:resend.senderAdjusted,
    requestedDomain:resend.requestedDomain,
    checks,
  });
}
