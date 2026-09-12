type SendEmailArgs={
  to:string;
  subject:string;
  html:string;
  text?:string;
};

export function resendConfigured(){
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendTransactionalEmail({to,subject,html,text}:SendEmailArgs){
  const key=process.env.RESEND_API_KEY;
  if(!key)throw new Error("RESEND_NOT_CONFIGURED");
  const from=process.env.RESEND_FROM_EMAIL||"EDITA <no-reply@getedita.app>";

  const r=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+key,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      from,
      to:[to],
      subject,
      html,
      text:text||undefined
    }),
    cache:"no-store"
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body?.message||body?.error?.message||"RESEND_SEND_FAILED");
  return body;
}

export function authEmailHtml(title:string,body:string,button:string,url:string){
  const safeUrl=url.replace(/"/g,"%22");
  return `<!doctype html><html><body style="margin:0;background:#f4f4ef;font-family:Arial,sans-serif;color:#151613">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px">
    <div style="font-size:26px;font-weight:900;margin-bottom:30px">EDITA<span style="color:#b8ef35">.</span></div>
    <div style="background:white;border:1px solid #dedfd6;border-radius:18px;padding:28px">
      <h1 style="font-size:28px;line-height:1.1;margin:0 0 16px">${title}</h1>
      <p style="font-size:16px;line-height:1.6;color:#565851">${body}</p>
      <a href="${safeUrl}" style="display:inline-block;margin-top:12px;background:#151613;color:white;text-decoration:none;padding:13px 18px;border-radius:12px;font-weight:700">${button}</a>
      <p style="font-size:12px;line-height:1.5;color:#7a7c75;margin-top:24px">Если ты не запрашивал это письмо, просто проигнорируй его. Никому не пересылай ссылку из письма.</p>
    </div>
    <p style="font-size:12px;color:#7a7c75;margin-top:16px">EDITA · getedita.app</p>
  </div></body></html>`;
}
