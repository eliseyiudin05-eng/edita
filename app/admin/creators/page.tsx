"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Application={
  id:string;display_name:string;email:string;social_url?:string|null;portfolio_url?:string|null;
  preferred_format?:string|null;desired_rate?:string|null;note?:string|null;status:string;created_at:string;
};
type Interest={
  id:string;email:string;social_url?:string|null;message?:string|null;status:string;created_at:string;
  creator_briefs?:{title?:string;slug?:string}|null;
};

export default function CreatorsAdmin(){
  const [applications,setApplications]=useState<Application[]>([]);
  const [interest,setInterest]=useState<Interest[]>([]);
  const [message,setMessage]=useState("Загружаем…");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/admin/creators",{headers:h,cache:"no-store"});
    const data=await r.json();
    if(!r.ok){setMessage(data?.error||"Нет доступа.");return;}
    setApplications(data.applications||[]);
    setInterest(data.interest||[]);
    setMessage("");
  }

  useEffect(()=>{void load()},[]);

  async function setStatus(kind:"application"|"interest",id:string,status:string){
    const h=await headers();
    const r=await fetch("/api/admin/creators",{
      method:"POST",
      headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify({kind,id,status})
    });
    const data=await r.json();
    setMessage(r.ok?"Статус заявки автора обновлён.":data?.error||"Не удалось обновить заявку. Повтори действие.");
    if(r.ok)await load();
  }

  return <main className="legal-page"><div className="legal-shell">
    <Link href="/platform" className="brand">KIVRONIX<span>.</span></Link>
    <div className="eyebrow">АДМИН · МОНТАЖЁРЫ KIVRONIX</div>
    <h1>Команда монтажёров</h1>
    <p>Здесь заявки в постоянную команду и отклики на официальные задания KIVRONIX.</p>
    {message&&<div className="auth-msg" role="status" aria-live="polite">{message}</div>}

    <h2>Заявки в постоянную команду</h2>
    <div className="business-stack">
      {applications.length===0&&<div className="auth-msg">Заявок пока нет.</div>}
      {applications.map(a=><section className="legal-card" key={a.id}>
        <div className="verification-head"><div><div className="eyebrow">КОМАНДА МОНТАЖЁРОВ</div><h2>{a.display_name}</h2></div><span className="verification-badge">{a.status}</span></div>
        <p><b>Электронная почта:</b> {a.email}</p>
        {a.social_url&&<p><a href={a.social_url} target="_blank" rel="noreferrer"><u>Соцсеть ↗</u></a></p>}
        {a.portfolio_url&&<p><a href={a.portfolio_url} target="_blank" rel="noreferrer"><u>Работы автора ↗</u></a></p>}
        <p><b>Что снимает:</b> {a.preferred_format||"—"}<br/><b>Ожидание по оплате:</b> {a.desired_rate||"—"}</p>
        {a.note&&<p>{a.note}</p>}
        <div className="lesson-actions"><button className="btn btn-dark" onClick={()=>setStatus("application",a.id,"approved")}>Принять в команду</button><button className="btn btn-ghost" onClick={()=>setStatus("application",a.id,"paused")}>Отложить</button><button className="btn btn-ghost" onClick={()=>setStatus("application",a.id,"rejected")}>Пропустить</button></div>
      </section>)}
    </div>

    <h2 style={{marginTop:36}}>Отклики на задания</h2>
    <div className="business-stack">
      {interest.length===0&&<div className="auth-msg">Откликов пока нет.</div>}
      {interest.map(i=><section className="legal-card" key={i.id}>
        <div className="verification-head"><div><div className="eyebrow">ОТКЛИК НА ЗАДАНИЕ</div><h2>{i.creator_briefs?.title||"Задание KIVRONIX"}</h2></div><span className="verification-badge">{i.status}</span></div>
        <p><b>Электронная почта:</b> {i.email}</p>
        {i.social_url&&<p><a href={i.social_url} target="_blank" rel="noreferrer"><u>Профиль ↗</u></a></p>}
        {i.message&&<p>{i.message}</p>}
        <div className="lesson-actions"><button className="btn btn-dark" onClick={()=>setStatus("interest",i.id,"contacted")}>Связь начата</button><button className="btn btn-lime" onClick={()=>setStatus("interest",i.id,"accepted")}>Согласовали работу</button><button className="btn btn-ghost" onClick={()=>setStatus("interest",i.id,"declined")}>Пропустить</button></div>
      </section>)}
    </div>
  </div></main>
}
