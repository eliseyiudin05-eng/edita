"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Row={
  id:string;portfolio_url?:string|null;sample_url?:string|null;note?:string|null;status:string;
  profiles?:{display_name?:string;username?:string;onboarding?:{ageGroup?:string}}|null;
};

export default function EditorVerificationAdmin(){
  const [rows,setRows]=useState<Row[]>([]);
  const [message,setMessage]=useState("Загружаем…");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }
  async function load(){
    const h=await headers();
    const r=await fetch("/api/admin/editor-verification",{headers:h,cache:"no-store"});
    const data=await r.json();
    if(!r.ok){setMessage(data?.error||"Нет доступа.");return;}
    setRows(data.requests||[]);
    setMessage(data.requests?.length?"":"Новых заявок нет.");
  }
  useEffect(()=>{void load()},[]);

  async function act(id:string,action:"approve"|"needs_info"|"reject"){
    const note=window.prompt(action==="approve"?"Комментарий можно оставить пустым":"Что нужно объяснить монтажёру?")||"";
    const h=await headers();
    const r=await fetch("/api/admin/editor-verification",{
      method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({id,action,note})
    });
    const data=await r.json();
    setMessage(r.ok?"Статус заявки монтажёра обновлён.":data?.error||"Не удалось обновить заявку. Повтори действие.");
    if(r.ok)await load();
  }

  return <main className="legal-page"><div className="legal-shell">
    <Link href="/platform" className="brand">KIVRONIX<span>.</span></Link>
    <div className="eyebrow">ADMIN · МОНТАЖЁРЫ</div>
    <h1>Проверка навыка монтажёра</h1>
    <p>Здесь проверяется качество и принадлежность работы монтажёру. Документы компании относятся к другому разделу.</p>
    {message&&<div className="auth-msg" role="status" aria-live="polite">{message}</div>}
    <div className="business-stack">
      {rows.map(row=><section className="legal-card" key={row.id}>
        <div className="verification-head"><div><div className="eyebrow">ЗАЯВКА МОНТАЖЁРА</div><h2>{row.profiles?.display_name||"Монтажёр"}</h2></div><span className="verification-badge pending">{row.status}</span></div>
        <p><b>Возрастная группа:</b> {row.profiles?.onboarding?.ageGroup||"пока пусто"}</p>
        {row.portfolio_url&&<p><a href={row.portfolio_url} target="_blank" rel="noreferrer"><u>Открыть работы ↗</u></a></p>}
        {row.sample_url&&<p><a href={row.sample_url} target="_blank" rel="noreferrer"><u>Открыть работу ↗</u></a></p>}
        {row.note&&<p>{row.note}</p>}
        <div className="lesson-actions">
          <button className="btn btn-dark" onClick={()=>act(row.id,"approve")}>✓ Навык проверен</button>
          <button className="btn btn-ghost" onClick={()=>act(row.id,"needs_info")}>Нужно уточнение</button>
          <button className="btn btn-ghost" onClick={()=>act(row.id,"reject")}>Отклонить</button>
        </div>
      </section>)}
    </div>
  </div></main>
}
