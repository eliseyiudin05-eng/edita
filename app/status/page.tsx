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

export default function StatusPage() {
  const [data,setData]=useState<Status|null>(null);
  const [ai,setAi]=useState<AiHealth|null>(null);

  useEffect(()=>{
    Promise.all([
      fetch("/api/system/status",{cache:"no-store"}).then(r=>r.json()),
      fetch("/api/ai/health",{cache:"no-store"}).then(r=>r.json())
    ]).then(([system,health])=>{setData(system);setAi(health)}).catch(()=>{setData(null);setAi(null)});
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
          text={data.services.supabase.configured?(data.services.supabase.serverWrites?"Client + server writes configured":"Auth/client настроены, server writes ещё выключены"):"Production database не подключена"}/>
        <Service title="ЮKassa" ok={data.services.yookassa.configured}
          text={data.services.yookassa.configured?("Подключена · "+data.services.yookassa.mode):"Ожидаем подтверждение магазина и ключи"}/>
      </div>}

      <div className="legal-actions"><Link className="btn btn-dark" href="/platform">Платформа</Link><Link className="btn btn-ghost" href="/pricing">Тарифы</Link></div>
    </div>
  </main>
}

function Service({title,ok,text}:{title:string;ok:boolean;text:string}){
  return <section className="legal-card status-card"><div className={"service-dot "+(ok?"ok":"warn")}/><h2>{title}</h2><p>{text}</p><b>{ok?"Готово":"Требует настройки"}</b></section>
}
