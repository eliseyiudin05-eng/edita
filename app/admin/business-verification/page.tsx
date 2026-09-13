"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Row={
  id:string;legal_name:string;inn?:string|null;registration_number?:string|null;
  website_url?:string|null;social_url?:string|null;reported_audience?:number|null;
  requested_level:string;status:string;created_at:string;review_note?:string|null;
  businesses?:{name?:string}|null;documents?:{path:string;url:string}[];
};

export default function BusinessVerificationAdmin(){
  const [rows,setRows]=useState<Row[]>([]);
  const [message,setMessage]=useState("Загружаем…");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/admin/business-verification",{headers:h,cache:"no-store"});
    const data=await r.json();
    if(!r.ok){setMessage(data?.error||"Нет доступа.");return;}
    setRows(data.requests||[]);
    setMessage(data.requests?.length?"":"Новых заявок нет.");
  }

  useEffect(()=>{void load()},[]);

  async function act(id:string,action:"approve"|"needs_info"|"reject",level?:string){
    const note=window.prompt(action==="approve"?"Комментарий (можно оставить пустым)":"Напиши понятную причину для бизнеса:")||"";
    const h=await headers();
    const r=await fetch("/api/admin/business-verification",{
      method:"POST",
      headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify({requestId:id,action,level,note})
    });
    const data=await r.json();
    setMessage(r.ok?"Готово.":data?.error||"Ошибка.");
    if(r.ok)await load();
  }

  return <main className="legal-page"><div className="legal-shell">
    <Link href="/platform" className="brand">KIVRONIX<span>.</span></Link>
    <div className="eyebrow">ADMIN · BUSINESS VERIFICATION</div>
    <h1>Проверка компаний</h1>
    <p>Документы закрыты от обычных пользователей. Ссылки ниже временные и нужны только для ручной проверки.</p>
    {message&&<div className="auth-msg">{message}</div>}
    <div className="business-stack">
      {rows.map(row=><section className="legal-card" key={row.id}>
        <div className="verification-head"><div><div className="eyebrow">{row.requested_level==="popular_brand"?"ЗАПРОС: ИЗВЕСТНЫЙ БРЕНД":"ЗАПРОС: ПРОВЕРЕННАЯ КОМПАНИЯ"}</div><h2>{row.legal_name}</h2></div><span className="verification-badge pending">{row.status}</span></div>
        <p><b>ИНН:</b> {row.inn||"—"} · <b>ОГРН/ОГРНИП:</b> {row.registration_number||"—"}</p>
        {row.website_url&&<p><a href={row.website_url} target="_blank" rel="noreferrer"><u>Открыть сайт ↗</u></a></p>}
        {row.social_url&&<p><a href={row.social_url} target="_blank" rel="noreferrer"><u>Открыть публичную страницу ↗</u></a>{row.reported_audience!=null?" · заявлено "+row.reported_audience.toLocaleString("ru-RU")+" подписчиков":""}</p>}
        <div className="source-assets"><b>Документы:</b>{(row.documents||[]).map((d,i)=><a key={d.path} href={d.url} target="_blank" rel="noreferrer">Документ {i+1} ↗</a>)}</div>
        <div className="lesson-actions">
          <button className="btn btn-dark" onClick={()=>act(row.id,"approve","verified_company")}>✓ Проверенная компания</button>
          <button className="btn btn-lime" onClick={()=>act(row.id,"approve","popular_brand")}>★ Известный бренд</button>
          <button className="btn btn-ghost" onClick={()=>act(row.id,"needs_info")}>Нужно уточнение</button>
          <button className="btn btn-ghost" onClick={()=>act(row.id,"reject")}>Отклонить</button>
        </div>
      </section>)}
    </div>
  </div></main>
}
