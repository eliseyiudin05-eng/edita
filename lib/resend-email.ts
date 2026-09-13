import {Resend} from "resend";

type SendEmailArgs={
  to:string;
  subject:string;
  html:string;
  text?:string;
};

const RESEND_API_URL="https://api.resend.com";
// Keep the KIVRONIX brand in the sender name, but use the already verified
// transactional domain until auth.kivronix.ru is verified in Resend.
const KIVRONIX_EMAIL_DOMAIN="auth.getedita.app";
const DEFAULT_FROM="KIVRONIX <no-reply@auth.getedita.app>";

type ResendApiErrorBody={
  message?:string;
  name?:string;
  code?:string;
  error?:{message?:string;name?:string;code?:string};
};

function cleanEnv(value:string|undefined){
  const trimmed=value?.trim()||"";
  if(trimmed.length>=2){
    const first=trimmed[0];
    const last=trimmed[trimmed.length-1];
    if((first==='"'&&last==='"')||(first==="'"&&last==="'"))return trimmed.slice(1,-1).trim();
  }
  return trimmed;
}

function cleanResendKey(value:string|undefined){
  const normalized=cleanEnv(value).replace(/\s+/g,"");
  const embeddedKey=normalized.match(/re_[A-Za-z0-9_-]{8,}/)?.[0];
  return embeddedKey||normalized;
}

function senderEmail(value:string){
  const bracket=value.match(/<([^<>]+)>\s*$/)?.[1];
  const candidate=(bracket||value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)?candidate:null;
}

function senderDomain(value:string){
  return senderEmail(value)?.split("@")[1]||null;
}

function safeErrorMessage(body:ResendApiErrorBody){
  const message=body?.message||body?.error?.message||"RESEND_REQUEST_FAILED";
  return String(message)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[redacted-email]")
    .slice(0,500);
}

function errorCode(body:ResendApiErrorBody){
  return String(body?.code||body?.name||body?.error?.code||body?.error?.name||"resend_error").slice(0,100);
}

export function getResendConfig(){
  const key=cleanResendKey(process.env.RESEND_API_KEY);
  const requestedFrom=cleanEnv(process.env.RESEND_FROM_EMAIL);
  const requestedDomain=requestedFrom?senderDomain(requestedFrom):null;
  const senderAdjusted=Boolean(requestedFrom&&requestedDomain!==KIVRONIX_EMAIL_DOMAIN);

  return {
    key:key||null,
    keyFormatValid:key.startsWith("re_"),
    from:requestedFrom&&!senderAdjusted?requestedFrom:DEFAULT_FROM,
    domain:KIVRONIX_EMAIL_DOMAIN,
    requestedDomain,
    senderAdjusted,
  };
}

export function resendConfigured(){
  const config=getResendConfig();
  return Boolean(config.key&&config.keyFormatValid);
}

export async function sendTransactionalEmail({to,subject,html,text}:SendEmailArgs){
  const config=getResendConfig();
  if(!config.key)throw new Error("RESEND_NOT_CONFIGURED");
  if(!config.keyFormatValid){
    console.error("Resend email configuration invalid",{code:"invalid_key_format"});
    throw new Error("RESEND_INVALID_KEY_FORMAT");
  }

  const resend=new Resend(config.key);
  const email={to:[to],subject,html,text:text||undefined};
  const result=await resend.emails.send({...email,from:config.from});

  if(result.error){
    const body:ResendApiErrorBody={
      message:result.error.message,
      name:result.error.name,
    };
    const code=errorCode(body);
    console.error("Resend email send failed",{
      status:result.error.statusCode||0,
      code,
      message:safeErrorMessage(body),
      senderDomain:config.domain,
      senderAdjusted:config.senderAdjusted,
      usedTestSender:false,
    });
    throw new Error("RESEND_SEND_FAILED:"+(result.error.statusCode||0)+":"+code);
  }
  return result.data;
}

export async function getResendServiceStatus(){
  const config=getResendConfig();
  const base={
    configured:Boolean(config.key),
    connected:false,
    verified:false,
    domain:config.domain,
    domainStatus:"unknown",
    apiStatus:0,
    errorCode:null as string|null,
    keyFormatValid:config.keyFormatValid,
    sendingEnabled:false,
    senderAdjusted:config.senderAdjusted,
    requestedDomain:config.requestedDomain,
  };

  if(!config.key)return {...base,domainStatus:"not_configured"};
  if(!config.keyFormatValid)return {...base,domainStatus:"invalid_key_format",errorCode:"invalid_key_format"};

  try{
    const r=await fetch(RESEND_API_URL+"/domains?limit=100",{
      headers:{Authorization:"Bearer "+config.key},
      cache:"no-store"
    });
    const body:ResendApiErrorBody&{data?:Array<{name?:string;status?:string;capabilities?:{sending?:string}}>}=await r.json().catch(()=>({}));
    if(!r.ok){
      const code=errorCode(body);
      if(r.status===401&&code==="restricted_api_key"){
        return {
          ...base,
          connected:true,
          apiStatus:r.status,
          domainStatus:"send_only_key",
          errorCode:null,
        };
      }
      return {
        ...base,
        apiStatus:r.status,
        domainStatus:"api_error",
        errorCode:code,
      };
    }

    const domain=Array.isArray(body.data)
      ?body.data.find(item=>item?.name?.toLowerCase()===config.domain)
      :undefined;
    const status=domain?.status||"missing";
    const sending=domain?.capabilities?.sending||"unknown";
    const sendingEnabled=sending==="enabled";

    return {
      ...base,
      connected:true,
      verified:status==="verified",
      sendingEnabled,
      domainStatus:status,
      apiStatus:r.status,
      errorCode:null,
    };
  }catch{
    return {...base,domainStatus:"network_error",errorCode:"network_error"};
  }
}

export function authEmailHtml(title:string,body:string,button:string,url:string){
  const safeUrl=url.replace(/"/g,"%22");
  return `<!doctype html><html><body style="margin:0;background:#f4f4ef;font-family:Arial,sans-serif;color:#151613">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="font-size:26px;font-weight:900;margin-bottom:30px">KIVRONIX<span style="color:#b8ef35">.</span></div>
    <div style="background:white;border:1px solid #dedfd6;border-radius:18px;padding:28px">
      <h1 style="font-size:28px;line-height:1.1;margin:0 0 16px">${title}</h1>
      <p style="font-size:16px;line-height:1.6;color:#565851">${body}</p>
      <a href="${safeUrl}" style="display:inline-block;margin-top:12px;background:#151613;color:white;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700">${button}</a>
      <p style="font-size:12px;line-height:1.5;color:#7a7c75;margin-top:24px">Письмо пришло по чужой ошибке? Просто закрой его. Сохраняй ссылку из письма в тайне.</p>
    </div>
    <p style="font-size:12px;color:#7a7c75;margin-top:16px">KIVRONIX · kivronix.ru</p>
  </div></body></html>`;
}
