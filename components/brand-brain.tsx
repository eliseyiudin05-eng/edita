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

export default function BrandBrain({viewerName="Business"}:{viewerName?:string}){
  const [form,setForm]=useState<BrandContext>(empty);
  const [businessId,setBusinessId]=useState<string|null>(null);
  const [message,setMessage]=useState("");

  useEffect(()=>{void load()},[]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      try{
        const raw=localStorage.getItem("edita_brand_brain");
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
      localStorage.setItem("edita_brand_brain",JSON.stringify(form));
      setMessage("Brand Brain сохранён локально в demo.");
      return;
    }
    const {error}=await supabase.from("businesses").update({brand_context:form}).eq("id",businessId);
    setMessage(error?error.message:"Brand Brain сохранён. Его можно использовать для новых ТЗ и AI-проверок.");
  }

  return <section className="card brand-brain">
    <div className="eyebrow">BRAND BRAIN</div>
    <h3>Контекст бренда для всех монтажёров</h3>
    <p className="muted">Сохраняем стиль один раз, чтобы новый редактор не начинал с нуля.</p>
    <form className="business-form" onSubmit={save}>
      <input placeholder="Целевая аудитория" value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}/>
      <input placeholder="Tone of voice: премиальный, дерзкий, спокойный…" value={form.tone} onChange={e=>setForm({...form,tone:e.target.value})}/>
      <input placeholder="Цвета / шрифты / визуальные правила" value={form.colors} onChange={e=>setForm({...form,colors:e.target.value})}/>
      <input placeholder="Ссылки на лучшие референсы" value={form.references} onChange={e=>setForm({...form,references:e.target.value})}/>
      <textarea placeholder="Повторяющиеся пожелания по монтажу и правкам" value={form.editingRules} onChange={e=>setForm({...form,editingRules:e.target.value})}/>
      <button className="btn btn-dark">Сохранить Brand Brain</button>
    </form>
    {message&&<div className="auth-msg">{message}</div>}
  </section>
}
