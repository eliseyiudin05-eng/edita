"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type State={
  emailVerified:boolean;
  ageGroup:string;
  guardianVerified:boolean;
  level:string;
  request?:{status:string;review_note?:string|null}|null;
};

export default function EditorVerification(){
  const [state,setState]=useState<State|null>(null);
  const [form,setForm]=useState({portfolioUrl:"",sampleUrl:"",note:""});
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/editor/verification",{headers:h,cache:"no-store"});
    const data=await r.json();
    if(r.ok)setState(data);
  }

  useEffect(()=>{void load()},[]);

  async function submit(e:FormEvent){
    e.preventDefault();setLoading(true);setMessage("");
    const h=await headers();
    const r=await fetch("/api/editor/verification",{
      method:"POST",
      headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify(form)
    });
    const data=await r.json();
    setLoading(false);
    if(!r.ok){setMessage(data?.error||"Не удалось отправить.");return;}
    setMessage("Работа отправлена на проверку. Мы смотрим именно навык монтажа — паспорт для этого не нужен.");
    await load();
  }

  if(!state)return null;
  const minor=state.ageGroup!=="18+";

  return <section className="card">
    <div className="eyebrow">ПРОВЕРКА МОНТАЖЁРА</div>
    <h3>Не такая, как у бизнеса</h3>
    <p className="muted">Компания подтверждает документы. Монтажёр подтверждает email, возрастной доступ и свой навык работой или портфолио.</p>

    <div className="verification-checks">
      <div className={state.emailVerified?"check-ok":"check-wait"}><b>{state.emailVerified?"✓":"○"} Email</b><span>{state.emailVerified?"Подтверждён":"Нужно подтвердить письмо"}</span></div>
      <div className={!minor||state.guardianVerified?"check-ok":"check-wait"}><b>{!minor||state.guardianVerified?"✓":"○"} Возрастной доступ</b><span>{!minor?"18+ указано при регистрации":state.guardianVerified?"Родитель подтверждён":"Ждём подтверждение родителя"}</span></div>
      <div className={state.level==="skills_verified"?"check-ok":"check-wait"}><b>{state.level==="skills_verified"?"✓":"○"} Навык монтажа</b><span>{state.level==="skills_verified"?"Работа проверена EDITA":state.request?.status==="pending"?"Работа на проверке":"Можно отправить портфолио или одну работу"}</span></div>
    </div>

    {state.level!=="skills_verified"&&state.request?.status!=="pending"&&<form className="business-form" onSubmit={submit}>
      <input type="url" placeholder="Ссылка на портфолио" value={form.portfolioUrl} onChange={e=>setForm({...form,portfolioUrl:e.target.value})}/>
      <input type="url" placeholder="Или ссылка на одну работу" value={form.sampleUrl} onChange={e=>setForm({...form,sampleUrl:e.target.value})}/>
      <textarea placeholder="Что ты делал в этой работе? Например: нарезка, субтитры, звук." value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/>
      <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем…":"Отправить навык на проверку"}</button>
    </form>}

    {state.request?.status==="rejected"&&<div className="auth-msg">Нужно исправить: {state.request.review_note||"добавь более понятную работу и отправь новую заявку."}</div>}
    {message&&<div className="auth-msg">{message}</div>}
  </section>
}
