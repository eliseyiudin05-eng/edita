"use client";
import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Role="editor"|"business";
type Onboarding={role?:Role;level?:string;software?:string;goal?:string};

export default function SignupPage(){
  const [role,setRole]=useState<Role>("editor");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [onboarding,setOnboarding]=useState<Onboarding>({});

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("edita_onboarding");
      if(!raw)return;
      const data=JSON.parse(raw) as Onboarding;
      setOnboarding(data);
      if(data.role==="business")setRole("business");
    }catch{}
  },[]);

  async function submit(e:FormEvent){
    e.preventDefault();
    setMessage("");
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      setMessage("Регистрация пока работает в demo: production-база/Auth ещё не подключены.");
      return;
    }
    setLoading(true);
    const {data,error}=await supabase.auth.signUp({
      email,
      password,
      options:{
        emailRedirectTo:window.location.origin+"/platform",
        data:{role,display_name:name,onboarding:{...onboarding,role}}
      }
    });
    setLoading(false);
    if(error){setMessage(error.message);return;}
    if(data.session){
      window.location.href="/platform";
      return;
    }
    setMessage("Аккаунт создан. Проверь почту и подтверди email, затем войди в EDITA.");
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="eyebrow">CREATE ACCOUNT</div>
      <h1>Начни путь в EDITA</h1>
      <p>Выбери роль. Персональный маршрут из onboarding будет сохранён в профиле.</p>
      <div className="role-grid">
        <button type="button" className={"role "+(role==="editor"?"active":"")} onClick={()=>setRole("editor")}><b>Монтажёр</b><br/><span className="muted">Учиться, соревноваться, работать</span></button>
        <button type="button" className={"role "+(role==="business"?"active":"")} onClick={()=>setRole("business")}><b>Бизнес</b><br/><span className="muted">Искать монтажёров и запускать ТЗ</span></button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <input required placeholder="Имя" value={name} onChange={e=>setName(e.target.value)} />
        <input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input required minLength={8} type="password" placeholder="Пароль от 8 символов" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="btn btn-dark" disabled={loading}>{loading?"Создаём...":"Создать аккаунт"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <div className="auth-footer"><Link href="/onboarding">← Изменить маршрут</Link> · Уже есть аккаунт? <Link href="/login"><b>Войти</b></Link></div>
    </section>
  </main>
}
