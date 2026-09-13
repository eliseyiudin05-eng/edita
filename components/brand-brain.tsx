"use client";

import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type BrandContext={
  audience:string;
  tone:string;
  colors:string;
  references:string;
  editingRules:string;
};

const empty:BrandContext={audience:"",tone:"",colors:"",references:"",editingRules:""};

export default function BrandBrain({viewerName="Компания"}:{viewerName?:string}){
  const [form,setForm]=useState<BrandContext>(empty);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [message,setMessage]=useState("");

  useEffect(()=>{void load()},[]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      try{
        const raw=localStorage.getItem("kivronix_brand_brain");
        if(raw)setForm(JSON.parse(raw));
      }catch{}
      return;
    }
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    let {data}=await supabase.from("businesses").select("id,brand_context").eq("owner_id",user.id).maybeSingle();
    if(!data){
      const {data:created}=await supabase.from("businesses")
        .upsert({owner_id:user.id,name:viewerName+" Studio"},{onConflict:"owner_id"})
        .select("id,brand_context")
        .single();
      data=created;
    }
    if(data){
      setBusinessId(data.id);
      setForm({...empty,...(data.brand_context||{})});
    }
  }

  async function save(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase||!businessId){
      localStorage.setItem("kivronix_brand_brain",JSON.stringify(form));
      setMessage("Пример профиля бренда сохранён в этом браузере.");
      return;
    }
    const {error}=await supabase.from("businesses").update({brand_context:form}).eq("id",businessId);
    setMessage(error?error.message:"Профиль бренда сохранён. Помощник сможет учитывать его в новых заданиях и проверках.");
  }

  return <section className="card brand-brain">
    <div className="eyebrow">ПРОФИЛЬ БРЕНДА</div>
    <h3>Правила бренда для всех монтажёров</h3>
    <p className="muted">Сохраняем стиль один раз, чтобы новый монтажёр сразу понимал правила бренда.</p>
    <form className="business-form" onSubmit={save}>
      <input placeholder="Для каких зрителей вы снимаете" value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}/>
      <input placeholder="Как звучит бренд: серьёзно, ярко, спокойно…" value={form.tone} onChange={e=>setForm({...form,tone:e.target.value})}/>
      <input placeholder="Цвета / шрифты / визуальные правила" value={form.colors} onChange={e=>setForm({...form,colors:e.target.value})}/>
      <input placeholder="Ссылки на хорошие примеры" value={form.references} onChange={e=>setForm({...form,references:e.target.value})}/>
      <textarea placeholder="Повторяющиеся пожелания по монтажу и правкам" value={form.editingRules} onChange={e=>setForm({...form,editingRules:e.target.value})}/>
      <button className="btn btn-dark">Сохранить профиль бренда</button>
    </form>
    {message&&<div className="auth-msg">{message}</div>}
  </section>
}
