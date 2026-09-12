"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Entry={
  id:string;work_url:string;note?:string|null;status:string;judge_score?:number|null;rewarded_at?:string|null;
  competition?:{title?:string;points_reward?:number}|null;
  profile?:{username?:string|null;display_name?:string|null;rating_points?:number;xp?:number}|null;
};

export default function LearningCompetitionsAdmin(){
  const [entries,setEntries]=useState<Entry[]>([]);
  const [message,setMessage]=useState("");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/admin/learning-competitions",{headers:h,cache:"no-store"});
    const d=await r.json();
    if(!r.ok){setMessage(d?.error||"Нет доступа.");return;}
    setEntries(d.entries||[]);
  }
  useEffect(()=>{void load()},[]);

  async function judge(id:string,status:"reviewed"|"finalist"|"winner"){
    const raw=window.prompt("Оценка от 0 до 100:");
    if(raw===null)return;
    const score=Number(raw);
    const h=await headers();
    const r=await fetch("/api/admin/learning-competitions",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({id,status,score})});
    const d=await r.json();
    setMessage(r.ok?"Результат сохранён.":d?.error||"Ошибка.");
    if(r.ok)await load();
  }

  return <main className="legal-page"><div className="legal-shell">
    <Link className="brand" href="/platform">EDITA<span>.</span></Link>
    <div className="eyebrow">ADMIN · УЧЕБНЫЕ СОРЕВНОВАНИЯ</div>
    <h1>Проверка работ</h1>
    <p>AI здесь не выбирает победителя. Итоговый статус и оценку ставит человек.</p>
    {message&&<div className="auth-msg">{message}</div>}
    <div className="business-stack">
      {entries.length===0&&<div className="auth-msg">Работ пока нет.</div>}
      {entries.map(e=><section className="legal-card" key={e.id}>
        <div className="verification-head"><div><div className="eyebrow">{e.competition?.title||"Соревнование"}</div><h2>@{e.profile?.username||"editor"}</h2></div><span className="verification-badge">{e.status}{e.judge_score!=null?" · "+e.judge_score+"/100":""}</span></div>
        <p><a href={e.work_url} target="_blank" rel="noreferrer"><u>Открыть работу ↗</u></a></p>
        {e.note&&<p>{e.note}</p>}
        {e.rewarded_at&&<div className="verification-success"><b>Награда уже начислена</b><span>Повторно начислена не будет.</span></div>}
        <div className="lesson-actions">
          <button className="btn btn-ghost" onClick={()=>judge(e.id,"reviewed")}>Проверено</button>
          <button className="btn btn-dark" onClick={()=>judge(e.id,"finalist")}>Финалист</button>
          <button className="btn btn-lime" onClick={()=>judge(e.id,"winner")}>Победитель · +{e.competition?.points_reward||0} XP</button>
        </div>
      </section>)}
    </div>
  </div></main>
}
