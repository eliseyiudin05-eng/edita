"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Row={display_name:string|null;username:string|null;level:number;ai_score:number|null;skills:string[];viewer:boolean};

const demo:Row[]=[
  {display_name:"Маша",username:"primer",level:8,ai_score:92,skills:["Короткие ролики","Реклама"],viewer:false},
  {display_name:"Алекс",username:null,level:7,ai_score:88,skills:["YouTube","Анимация"],viewer:false},
  {display_name:"Ника",username:null,level:6,ai_score:84,skills:["Вертикальные ролики","Видео с экспертом"],viewer:false},
];

export default function CommunityLeaderboard(){
  const [rows,setRows]=useState<Row[]>(demo);
  const [demoMode,setDemoMode]=useState(true);

  useEffect(()=>{void load()},[]);
  async function load(){
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)return;
    const response=await fetch("/api/social/ranking",{
      headers:{Authorization:"Bearer "+session.access_token},
      cache:"no-store",
    });
    if(!response.ok)return;
    const data=await response.json();
    const ranking=Array.isArray(data?.ranking)?data.ranking
      .filter((row:Row)=>row.ai_score!==null)
      .sort((a:Row,b:Row)=>Number(b.ai_score)-Number(a.ai_score))
      .slice(0,20):[];
    setRows(ranking as Row[]);setDemoMode(false);
  }

  return <div className="leaderboard">
    {demoMode&&<div className="auth-msg">Гостевой пример рейтинга. В аккаунте показываются реальные участники.</div>}{!demoMode&&rows.length===0&&<div className="auth-msg">Рейтинг заполнится после первых оценок роликов.</div>}
    {rows.map((row,i)=><article className="leader-row" key={(row.username||"editor")+i}>
      <div className="leader-rank">#{i+1}</div>
      <div className="leader-main"><b>{row.display_name||"Монтажёр"}</b><span>{(row.skills||[]).slice(0,3).join(" · ")||"Видеомонтаж"}</span></div>
      <div className="leader-stat"><strong>{row.ai_score??"—"}</strong><span>Оценка</span></div>
      <div className="leader-stat"><strong>{row.level}</strong><span>Уровень</span></div>
      {row.username?<Link className="btn btn-ghost" href={"/u/"+row.username}>Профиль</Link>:<span/>}
    </article>)}
    <p className="muted">Рейтинг показывает только имя, навыки и баллы. Электронная почта, возраст, доход и личные настройки скрыты.</p>
  </div>
}
