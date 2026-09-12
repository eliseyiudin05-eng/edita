"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = {
  ok: boolean;
  environment: string;
  siteUrl: string | null;
  services: {
    openai: { configured: boolean; model: string };
    supabase: { configured: boolean; serverWrites: boolean };
    yookassa: { configured: boolean; mode: string };
  };
};
type AiHealth={configured:boolean;connected:boolean;model:string;status?:number;errorCode?:string|null;errorType?:string|null};
type YooHealth={configured:boolean;connected:boolean;mode:string;error?:string};
type EmailHealth={
  configured:boolean;connected:boolean;domain:string;verified:boolean;domainStatus?:string;
  apiStatus?:number;errorCode?:string|null;keyFormatValid?:boolean;senderAdjusted?:boolean;
};

export default function StatusPage() {
  const [data,setData]=useState<Status|null>(null);
  const [ai,setAi]=useState<AiHealth|null>(null);
  const [yoo,setYoo]=useState<YooHealth|null>(null);
  const [emailHealth,setEmailHealth]=useState<EmailHealth|null>(null);

  useEffect(()=>{
    Promise.all([
      fetch("/api/system/status",{cache:"no-store"}).then(r=>r.json()),
      fetch("/api/ai/health",{cache:"no-store"}).then(r=>r.json()),
      fetch("/api/payments/yookassa/health",{cache:"no-store"}).then(r=>r.json()),
      fetch("/api/email/health",{cache:"no-store"}).then(r=>r.json())
    ]).then(([system,health,yooHealth,mail])=>{setData(system);setAi(health);setYoo(yooHealth);setEmailHealth(mail)}).catch(()=>{setData(null);setAi(null);setYoo(null);setEmailHealth(null)});
  },[]);

  return <main className="legal-page">
    <div className="legal-shell">
      <Link href="/" className="brand">EDITA<span>.</span></Link>
      <div className="eyebrow">СТАТУС СЕРВИСОВ</div>
      <h1>Готовность сервисов</h1>
      <p>Безопасная проверка конфигурации: секретные ключи здесь никогда не показываются.</p>

      {!data?<section className="legal-card"><p>Проверяем конфигурацию…</p></section>:<div className="status-grid">
        <Service title="OpenAI" ok={Boolean(ai?.connected)}
          text={!data.services.openai.configured?"Нужен OPENAI_API_KEY":ai?.connected?("API отвечает · "+ai.model):("Ключ есть, но API не подтвердил соединение"+(ai?.status?" · HTTP "+ai.status:"")+(ai?.errorCode?" · "+ai.errorCode:""))}/>
        <Service title="База / Auth" ok={data.services.supabase.configured&&data.services.supabase.serverWrites}
          text={data.services.supabase.configured?(data.services.supabase.serverWrites?"Клиент и серверные записи работают":"Вход работает, но серверные записи ещё выключены"):"База данных не подключена"}/>
        <Service title="Почта"
          ok={Boolean(emailHealth?.connected&&emailHealth?.verified)}
          text={!emailHealth?.configured
            ?"Нужен RESEND_API_KEY"
            :emailHealth?.keyFormatValid===false
              ?"В RESEND_API_KEY записан не API-ключ Resend"
            :!emailHealth?.connected
              ?("Resend-ключ есть, но API не подтвердил соединение"+(emailHealth?.apiStatus?" · HTTP "+emailHealth.apiStatus:"")+(emailHealth?.errorCode?" · "+emailHealth.errorCode:""))
              :emailHealth?.verified
                ?("Resend отвечает · домен "+emailHealth.domain+" подтверждён"+(emailHealth.senderAdjusted?" · адрес отправителя исправлен автоматически":""))
                :("Resend отвечает, но домен "+emailHealth.domain+" ещё не подтверждён · "+(emailHealth.domainStatus||"unknown"))}/>
        <Service title="ЮKassa" ok={Boolean(yoo?.connected)}
          text={!data.services.yookassa.configured?"Нужны ключи ЮKassa":yoo?.connected?("API отвечает · "+yoo.mode):(yoo?.error||"Ключи есть, но API не подтвердил соединение")}/>
      </div>}

      <div className="legal-actions"><Link className="btn btn-dark" href="/platform">Платформа</Link><Link className="btn btn-ghost" href="/pricing">Тарифы</Link></div>
    </div>
  </main>
}

function Service({title,ok,text}:{title:string;ok:boolean;text:string}){
  return <section className="legal-card status-card"><div className={"service-dot "+(ok?"ok":"warn")}/><h2>{title}</h2><p>{text}</p><b>{ok?"Готово":"Требует настройки"}</b></section>
}
