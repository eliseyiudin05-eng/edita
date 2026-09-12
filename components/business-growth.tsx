"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type LeagueRow={id:string;name:string;verification_level:string;points:number;challenges:number;jobs:number;submissions:number;winners:number};
type Talent={editor_id:string;note?:string|null;profile?:{username?:string|null;display_name?:string|null;level?:number;xp?:number;rating_points?:number;ai_score?:number|null}|null};

export default function BusinessGrowth(){
  const [season,setSeason]=useState("");
  const [board,setBoard]=useState<LeagueRow[]>([]);
  const [mine,setMine]=useState<LeagueRow|null>(null);
  const [talent,setTalent]=useState<Talent[]>([]);
  const [username,setUsername]=useState("");
  const [note,setNote]=useState("");
  const [message,setMessage]=useState("");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/business/growth",{headers:h,cache:"no-store"});
    const d=await r.json();
    if(!r.ok)return;
    setSeason(d.season||"");
    setBoard(d.leaderboard||[]);
    setMine(d.mine||null);
    setTalent(d.talent||[]);
  }
  useEffect(()=>{void load()},[]);

  async function save(e:FormEvent){
    e.preventDefault();setMessage("");
    const h=await headers();
    const r=await fetch("/api/business/growth",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action:"save_editor",username,note})});
    const d=await r.json();
    setMessage(r.ok?"Монтажёр добавлен в ваш пул талантов.":d?.error||"Ошибка.");
    if(r.ok){setUsername("");setNote("");await load()}
  }

  async function remove(editorId:string){
    const h=await headers();
    await fetch("/api/business/growth",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({action:"remove_editor",editorId})});
    await load();
  }

  return <div className="business-stack">
    <section className="card business-growth-card">
      <div className="eyebrow">EDITA BRAND LEAGUE</div>
      <div className="verification-head"><div><h3>{season||"Лига компаний"}</h3><p className="muted">Проверенные компании соревнуются не деньгами, а качественной активностью на платформе.</p></div>{mine&&<span className="verification-badge ok">{mine.points} очков</span>}</div>
      <div className="league-rules"><span>+ за проверку компании</span><span>+ за реальные задания</span><span>+ за работы участников</span><span>+ за выбранных победителей</span></div>
      <div className="business-league-list">
        {board.length===0?<p className="muted">Лига стартует с первых проверенных компаний.</p>:board.slice(0,8).map((b,i)=><div className="business-league-row" key={b.id}><b>#{i+1}</b><span>{b.name}</span><strong>{b.points}</strong></div>)}
      </div>
      <p className="muted">Счёт ограничивает количество однотипных действий, поэтому просто создать много пустых вакансий недостаточно.</p>
    </section>

    <section className="card">
      <div className="eyebrow">СВОЯ КОМАНДА МОНТАЖЁРОВ</div>
      <h3>Пул талантов</h3>
      <p className="muted">Сохраняйте сильных монтажёров после Challenge и возвращайтесь к ним в следующих рекламных кампаниях.</p>
      <form className="business-form" onSubmit={save}>
        <input required placeholder="@username монтажёра" value={username} onChange={e=>setUsername(e.target.value)}/>
        <input placeholder="Заметка: сильные Reels, хороший звук…" value={note} onChange={e=>setNote(e.target.value)}/>
        <button className="btn btn-dark">Добавить в пул</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <div className="talent-pool">
        {talent.length===0?<p className="muted">Пока пусто. Добавьте первого монтажёра по его @username.</p>:talent.map(t=><div className="talent-row" key={t.editor_id}><div><b>@{t.profile?.username||"editor"}</b><span>{t.profile?.rating_points||0} рейтинга · {t.profile?.xp||0} XP</span></div><button className="btn btn-ghost" onClick={()=>remove(t.editor_id)}>Убрать</button></div>)}
      </div>
    </section>

    <section className="card">
      <div className="eyebrow">ЗАЧЕМ БИЗНЕСУ ОСТАВАТЬСЯ В EDITA</div>
      <h3>Все кампании в одном месте</h3>
      <div className="benefit-grid">
        <div><b>Фирменные Challenge</b><span>Запускайте серию заданий под один бренд.</span></div>
        <div><b>Пул талантов</b><span>Не ищите хорошего монтажёра заново каждый месяц.</span></div>
        <div><b>Brand League</b><span>Рейтинг активности и заметность среди участников платформы.</span></div>
        <div><b>Работы по одному ТЗ</b><span>Сравнивайте кандидатов в одинаковых условиях.</span></div>
      </div>
    </section>
  </div>
}
