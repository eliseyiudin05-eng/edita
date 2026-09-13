"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Data={
  needed:boolean;
  verified:boolean;
  request?:{status:string;review_note?:string|null;guardian_email?:string|null}|null;
};

export default function GuardianVerification(){
  const [data,setData]=useState<Data|null>(null);
  const [form,setForm]=useState({guardianName:"",guardianEmail:"",relationship:"Родитель"});
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function headers():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function load(){
    const h=await headers();
    const r=await fetch("/api/guardian/verification",{headers:h,cache:"no-store"});
    const json=await r.json();
    if(r.ok)setData(json);
  }

  useEffect(()=>{void load()},[]);

  async function submit(e:FormEvent){
    e.preventDefault();setLoading(true);setMessage("");
    try{
      const h=await headers();
      const r=await fetch("/api/guardian/verification",{
        method:"POST",
        headers:{...h,"Content-Type":"application/json"},
        body:JSON.stringify(form)
      });
      const json=await r.json();
      if(!r.ok)throw new Error(json?.error||"Ошибка отправки заявки.");
      setMessage("Заявка отправлена. Учёба уже открыта, а подтверждение взрослого откроет коммерческие функции.");
      await load();
    }catch(e){
      setMessage(e instanceof Error?e.message:"Ошибка.");
    }finally{setLoading(false)}
  }

  if(!data?.needed)return null;
  if(data.verified)return <section className="card"><div className="eyebrow">БЕЗОПАСНОСТЬ</div><h3>Родитель подтверждён ✓</h3><p className="muted">Коммерческие функции доступны с учётом остальных правил KIVRONIX.</p></section>;

  if(data.request?.status==="pending")return <section className="card"><div className="eyebrow">БЕЗОПАСНОСТЬ</div><h3>Ждём подтверждение родителя</h3><p className="muted">Заявка уже отправлена. Уроки и помощник доступны. Вакансии, оплачиваемая работа и конкурсы компаний откроются после подтверждения.</p></section>;

  return <section className="card">
    <div className="eyebrow">БЕЗОПАСНОСТЬ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ДО 18 ЛЕТ</div>
    <h3>Подтверждение родителя</h3>
    <p className="muted">Паспорт ребёнка остаётся за пределами этой формы. Заявка проверяется вручную, а KIVRONIX хранит только итог проверки взрослого.</p>
    <form className="business-form" onSubmit={submit}>
      <input required placeholder="Имя и фамилия родителя" value={form.guardianName} onChange={e=>setForm({...form,guardianName:e.target.value})}/>
      <input required type="email" placeholder="Электронная почта родителя" value={form.guardianEmail} onChange={e=>setForm({...form,guardianEmail:e.target.value})}/>
      <select value={form.relationship} onChange={e=>setForm({...form,relationship:e.target.value})}>
        <option>Родитель</option>
        <option>Опекун</option>
        <option>Попечитель</option>
        <option>Другой законный представитель</option>
      </select>
      <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем…":"Отправить заявку"}</button>
    </form>
    {message&&<div className="auth-msg">{message}</div>}
  </section>
}
