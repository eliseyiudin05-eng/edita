"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Entry={
  id:string;work_url:string;note?:string|null;status:string;judge_score?:number|null;rewarded_at?:string|null;verified_views?:number;views_checked_at?:string|null;place?:number|null;prize_cents?:number;
  competition?:{id?:string;title?:string;points_reward?:number;competition_kind?:string;selection_metric?:string}|null;
  profile?:{username?:string|null;display_name?:string|null;rating_points?:number;xp?:number;school_name?:string|null}|null;
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

  async function verifyViews(id:string){
    const raw=window.prompt("Подтверждённое количество просмотров:");
    if(raw===null)return;
    const verifiedViews=Number(raw);
    const h=await headers();
    const r=await fetch("/api/admin/learning-competitions",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({id,action:"verify_views",verifiedViews})});
    const d=await r.json();setMessage(r.ok?"Просмотры сохранены.":d?.error||"Ошибка.");if(r.ok)await load();
  }

  async function finalizeViews(competitionId:string){
    if(!window.confirm("Зафиксировать топ-3 по проверенным просмотрам? Сначала проверь каждую работу."))return;
    const h=await headers();
    const r=await fetch("/api/admin/learning-competitions",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action:"finalize_views",competitionId})});
    const d=await r.json();setMessage(r.ok?"Топ-3 зафиксирован по просмотрам. При равенстве выше более ранняя работа.":d?.error||"Ошибка.");if(r.ok)await load();
  }

  const prizeCompetitions=Array.from(new Map(entries.filter(entry=>entry.competition?.competition_kind==="prize"&&entry.competition?.id).map(entry=>[entry.competition!.id!,entry.competition!])).values());

  return <main className="legal-page"><div className="legal-shell">
    <Link className="brand" href="/platform">EDITA<span>.</span></Link>
    <div className="eyebrow">ADMIN · УЧЕБНЫЕ СОРЕВНОВАНИЯ</div>
    <h1>Проверка работ</h1>
    <p>AI здесь не выбирает победителя. Просмотры проверяются вручную, затем система строго фиксирует топ-3.</p>
    {message&&<div className="auth-msg">{message}</div>}
    {prizeCompetitions.map(competition=><section className="legal-card" key={competition.id}><div className="verification-head"><div><div className="eyebrow">ИТОГИ ПО ПРОСМОТРАМ</div><h2>{competition.title}</h2></div><button className="btn btn-dark" onClick={()=>finalizeViews(competition.id!)}>Зафиксировать топ-3</button></div><p className="muted">Кнопка сработает только после дедлайна и проверки просмотров у каждой работы.</p></section>)}
    <div className="business-stack">
      {entries.length===0&&<div className="auth-msg">Работ пока нет.</div>}
      {entries.map(e=><section className="legal-card" key={e.id}>
        <div className="verification-head"><div><div className="eyebrow">{e.competition?.title||"Соревнование"}</div><h2>@{e.profile?.username||"editor"}</h2><small>{e.profile?.school_name||"Школа не указана"}</small></div><span className="verification-badge">{e.place?e.place+" место":e.status}{e.judge_score!=null?" · "+e.judge_score+"/100":""}</span></div>
        <p><a href={e.work_url} target="_blank" rel="noreferrer"><u>Открыть работу ↗</u></a></p>
        {e.competition?.selection_metric==="verified_views"?<div className="auth-msg"><b>{Number(e.verified_views||0).toLocaleString("ru-RU")} просмотров</b>{e.views_checked_at?" · проверено "+new Date(e.views_checked_at).toLocaleString("ru-RU"):" · ещё не проверено"}</div>:null}
        {e.note&&<p>{e.note}</p>}
        {e.rewarded_at&&<div className="verification-success"><b>Награда уже начислена</b><span>Повторно начислена не будет.</span></div>}
        <div className="lesson-actions">
          {e.competition?.selection_metric==="verified_views"?<button className="btn btn-ghost" onClick={()=>verifyViews(e.id)}>Обновить просмотры</button>:null}
          <button className="btn btn-ghost" onClick={()=>judge(e.id,"reviewed")}>Проверено</button>
          <button className="btn btn-dark" onClick={()=>judge(e.id,"finalist")}>Финалист</button>
          {e.competition?.competition_kind!=="prize"?<button className="btn btn-lime" onClick={()=>judge(e.id,"winner")}>Победитель · +{e.competition?.points_reward||0} XP</button>:null}
        </div>
        {e.competition?.competition_kind==="prize"?<p className="muted">Место назначается общей кнопкой строго по проверенным просмотрам после дедлайна.</p>:null}
      </section>)}
    </div>
  </div></main>
}
