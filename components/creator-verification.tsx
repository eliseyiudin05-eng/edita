"use client";
import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function CreatorVerification(){
  const [socialUrl,setSocialUrl]=useState("");
  const [state,setState]=useState<any>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  async function headers():Promise<Record<string,string>>{const s=await getSupabaseBrowserClient().auth.getSession();return s.data.session?.access_token?{Authorization:"Bearer "+s.data.session.access_token}:{};}
  async function load(){const r=await fetch("/api/business/verification",{headers:await headers(),cache:"no-store"});if(r.ok)setState(await r.json());}
  useEffect(()=>{try{setSocialUrl(localStorage.getItem("kivronix_creator_verification_prefill")||"")}catch{} void load();},[]);
  async function submit(e:FormEvent){
    e.preventDefault();setLoading(true);setMessage("");
    const r=await fetch("/api/business/verification",{method:"POST",headers:{...(await headers()),"Content-Type":"application/json"},body:JSON.stringify({creatorAccount:true,socialUrl})});
    const data=await r.json().catch(()=>({}));setLoading(false);setMessage(r.ok?"Аккаунт отправлен на проверку. После подтверждения ты сможешь публиковать задания.":data?.error||"Не удалось отправить заявку.");if(r.ok){localStorage.removeItem("kivronix_creator_verification_prefill");await load();}
  }
  const verified=Boolean(state?.business?.verified);const pending=state?.request?.status==="pending";
  return <section className="card verification-card"><div className="verification-head"><div><div className="eyebrow">ПРОВЕРКА ЗАКАЗЧИКА</div><h3>Подтверди публичный аккаунт</h3></div><span className={"verification-badge "+(verified?"ok":pending?"pending":"")}>{verified?"Проверен":pending?"На проверке":"Не проверен"}</span></div>
    <p className="muted">Мы вручную проверим, что страница существует, открыта и принадлежит настоящему автору. Документы компании не нужны.</p>
    {verified?<div className="verification-success"><b>Аккаунт подтверждён</b><span>Теперь можно публиковать задания и выбирать монтажёров.</span></div>:pending?<div className="auth-msg">Заявка уже отправлена. После ручной проверки здесь появится отметка.</div>:<form className="business-form" onSubmit={submit}><input required type="url" placeholder="https://instagram.com/... или другая публичная страница" value={socialUrl} onChange={e=>setSocialUrl(e.target.value)}/><button className="btn btn-dark" disabled={loading}>{loading?"Отправляем…":"Отправить на проверку"}</button></form>}
    {message&&<div className="auth-msg">{message}</div>}
  </section>;
}
