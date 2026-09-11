"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Role="editor"|"business";

export default function SignupPage(){
  const [role,setRole]=useState<Role>("editor");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    setMessage("");
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      setMessage("Supabase пока не подключён. Добавь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в .env.local.");
      return;
    }
    setLoading(true);
    const {error}=await supabase.auth.signUp({
      email,
      password,
      options:{data:{role,display_name:name}}
    });
    setLoading(false);
    setMessage(error ? error.message : "Готово. Проверь почту для подтверждения аккаунта.");
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="eyebrow">CREATE ACCOUNT</div>
      <h1>Начни путь в EDITA</h1>
      <p>Выбери роль. Для монтажёра откроются обучение, Arena и Jobs. Для бизнеса — Challenges и подбор талантов.</p>
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
      <div className="auth-footer">Уже есть аккаунт? <Link href="/login"><b>Войти</b></Link></div>
    </section>
  </main>
}
