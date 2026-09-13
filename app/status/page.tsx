"use client";

import Link from "next/link";
import {useEffect,useState} from "react";

type Status={services:{openai:{configured:boolean;model:string};supabase:{configured:boolean;serverWrites:boolean};email:{configured:boolean}}};
type AiHealth={configured:boolean;connected:boolean;model:string};
type EmailHealth={configured:boolean;connected:boolean;verified:boolean;domain:string};

export default function StatusPage(){
  const [data,setData]=useState<Status|null>(null);
  const [ai,setAi]=useState<AiHealth|null>(null);
  const [mail,setMail]=useState<EmailHealth|null>(null);

  useEffect(()=>{
    Promise.all([
      fetch("/api/system/status",{cache:"no-store"}).then(response=>response.json()),
      fetch("/api/ai/health",{cache:"no-store"}).then(response=>response.json()),
      fetch("/api/email/health",{cache:"no-store"}).then(response=>response.json())
    ]).then(([system,helper,email])=>{setData(system);setAi(helper);setMail(email)}).catch(()=>{setData(null);setAi(null);setMail(null)});
  },[]);

  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">KIVRONIX<span>.</span></Link>
    <div className="eyebrow">РАБОТА СЕРВИСОВ</div>
    <h1>Состояние KIVRONIX</h1>
    <p>Здесь видна готовность главных частей платформы. Секретные ключи всегда скрыты.</p>

    {!data?<section className="legal-card"><p>Проверяем сервисы…</p></section>:<div className="status-grid">
      <Service title="Помощник" ok={Boolean(ai?.connected)} text={ai?.connected?"Готов отвечать на вопросы":"Связь с помощником ждёт настройки"}/>
      <Service title="Аккаунты и данные" ok={data.services.supabase.configured&&data.services.supabase.serverWrites} text={data.services.supabase.configured&&data.services.supabase.serverWrites?"Вход и сохранение данных работают":"Подключение базы ждёт настройки"}/>
      <Service title="Письма" ok={Boolean(mail?.connected&&mail?.verified)} text={mail?.connected&&mail?.verified?"Письма подтверждения отправляются":"Отправка писем ждёт настройки"}/>
      <Service title="Доступ" ok text="Ранний доступ открыт бесплатно; списания выключены"/>
    </div>}

    <div className="legal-actions"><Link className="btn btn-dark" href="/platform">Открыть платформу</Link><Link className="btn btn-ghost" href="/">На главную</Link></div>
  </div></main>
}

function Service({title,ok,text}:{title:string;ok:boolean;text:string}){
  return <section className="legal-card status-card"><div className={"service-dot "+(ok?"ok":"warn")}/><h2>{title}</h2><p>{text}</p><b>{ok?"Готово":"Ждёт настройки"}</b></section>
}
