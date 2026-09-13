"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Candidate={id:string;topic:string;content:string;status:string;created_at:string;reviewed_at?:string|null};
type Knowledge={id:string;topic:string;content:string;version:number;published:boolean;updated_at:string};

export default function AiLearningAdmin(){
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [knowledge,setKnowledge]=useState<Knowledge[]>([]);
  const [message,setMessage]=useState("");

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }
  async function load(){
    const response=await fetch("/api/admin/ai-learning",{headers:await headers(),cache:"no-store"});
    const data=await response.json();
    if(!response.ok){setMessage(data?.error||"Нет доступа.");return;}
    setCandidates(data.candidates||[]);setKnowledge(data.knowledge||[]);
  }
  useEffect(()=>{void load()},[]);

  async function act(action:"approve"|"reject"|"unpublish",id:string){
    if(action==="approve"&&!window.confirm("Опубликовать этот материал в проверенной базе знаний помощника?"))return;
    const response=await fetch("/api/admin/ai-learning",{method:"POST",headers:{...(await headers()),"Content-Type":"application/json"},body:JSON.stringify({action,id})});
    const data=await response.json();
    setMessage(response.ok?"Изменение сохранено.":data?.error||"Ошибка.");
    if(response.ok)await load();
  }

  return <main className="legal-page"><div className="legal-shell">
    <Link className="brand" href="/platform">KIVRONIX<span>.</span></Link>
    <div className="eyebrow">ADMIN · БЕЗОПАСНОЕ ОБУЧЕНИЕ ИИ</div>
    <h1>Очередь улучшений</h1>
    <p>Отзывы пользователей сначала попадают на проверку. Помощник использует материал только после явного одобрения администратора.</p>
    {message?<div className="auth-msg" role="status">{message}</div>:null}
    <section className="legal-card"><h2>На проверке</h2>
      <div className="business-stack">{candidates.filter(item=>item.status==="pending").map(item=><article className="ai-learning-item" key={item.id}>
        <div><b>{item.topic}</b><small>{new Date(item.created_at).toLocaleString("ru-RU")}</small></div>
        <pre>{item.content}</pre>
        <div className="lesson-actions"><button className="btn btn-lime" onClick={()=>void act("approve",item.id)}>Одобрить и опубликовать</button><button className="btn btn-ghost" onClick={()=>void act("reject",item.id)}>Отклонить</button></div>
      </article>)}</div>
      {!candidates.some(item=>item.status==="pending")?<p className="muted">Очередь пуста.</p>:null}
    </section>
    <section className="legal-card"><h2>Опубликованная база</h2>
      <div className="business-stack">{knowledge.map(item=><article className="ai-learning-item" key={item.id}><div><b>{item.topic}</b><small>Версия {item.version} · {item.published?"используется":"выключена"}</small></div><pre>{item.content}</pre>{item.published?<button className="btn btn-ghost" onClick={()=>void act("unpublish",item.id)}>Снять с публикации</button>:null}</article>)}</div>
      {!knowledge.length?<p className="muted">Одобренных материалов пока нет.</p>:null}
    </section>
  </div></main>;
}
