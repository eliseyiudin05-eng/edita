"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Row={
  id:string;user_id:string;guardian_name:string;guardian_email:string;relationship:string;
  method:string;status:string;review_note?:string|null;created_at:string;
  profile?:{display_name?:string;username?:string;onboarding?:{ageGroup?:string}}|null;
};

export default function GuardianAdmin(){
  const [rows,setRows]=useState<Row[]>([]);
  const [message,setMessage]=useState("Загружаем…");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/admin/guardian-verification",{headers:h,cache:"no-store"});
    const data=await r.json();
    if(!r.ok){setMessage(data?.error||"Нет доступа.");return;}
    setRows(data.requests||[]);
    setMessage(data.requests?.length?"":"Новых заявок нет.");
  }

  useEffect(()=>{void load()},[]);

  async function act(id:string,action:"approve"|"needs_info"|"reject"){
    const note=window.prompt(action==="approve"?"Комментарий (можно оставить пустым)":"Что нужно сообщить пользователю?")||"";
    const h=await headers();
    const r=await fetch("/api/admin/guardian-verification",{
      method:"POST",
      headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify({requestId:id,action,note})
    });
    const data=await r.json();
    setMessage(r.ok?"Готово.":data?.error||"Ошибка.");
    if(r.ok)await load();
  }

  return <main className="legal-page"><div className="legal-shell">
    <Link href="/platform" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">ADMIN · БЕЗОПАСНОСТЬ</div>
    <h1>Подтверждение родителей</h1>
    <p>Это начальная ручная проверка. Для публичной работы паспорт и проверку личности родителя следует передать специальному сервису, а в EDITA хранить только итог.</p>
    {message&&<div className="auth-msg">{message}</div>}
    <div className="business-stack">
      {rows.map(row=><section className="legal-card" key={row.id}>
        <div className="verification-head"><div><div className="eyebrow">ПОЛЬЗОВАТЕЛЬ ДО 18 ЛЕТ</div><h2>{row.profile?.display_name||"Пользователь"}</h2></div><span className="verification-badge pending">{row.status}</span></div>
        <p><b>Возрастная группа:</b> {row.profile?.onboarding?.ageGroup||"пока пусто"}</p>
        <p><b>Родитель / представитель:</b> {row.guardian_name} · {row.relationship}</p>
        <p><b>Электронная почта родителя:</b> {row.guardian_email}</p>
        <div className="warning">Перед подтверждением свяжитесь с родителем отдельно и проверьте его полномочия. Поля этой формы дают только начальную информацию.</div>
        <div className="lesson-actions">
          <button className="btn btn-dark" onClick={()=>act(row.id,"approve")}>Подтвердить после проверки</button>
          <button className="btn btn-ghost" onClick={()=>act(row.id,"needs_info")}>Нужно уточнение</button>
          <button className="btn btn-ghost" onClick={()=>act(row.id,"reject")}>Отклонить</button>
        </div>
      </section>)}
    </div>
  </div></main>
}
