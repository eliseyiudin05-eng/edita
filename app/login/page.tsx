"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {authErrorRu} from "@/lib/auth-errors";

export default function LoginPage(){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("Сервис входа ждёт настройки.");return;}
    setLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    setLoading(false);
    if(error){setMessage(authErrorRu(error.message));return;}
    const requested=new URLSearchParams(window.location.search).get("from");
    router.push(requested?.startsWith("/")&&!requested.startsWith("//")?requested:"/platform");
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="eyebrow">ВХОД</div>
      <h1>Войти в EDITA</h1>
      <p>Вернись к обучению, заданиям, работе и помощнику EDITA.</p>
      <form className="auth-form" onSubmit={submit}>
        <input required type="email" placeholder="Электронная почта" value={email} onChange={e=>setEmail(e.target.value)} />
        <input required type="password" placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="btn btn-dark" disabled={loading}>{loading?"Входим...":"Войти"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <div className="auth-footer"><Link href="/forgot-password">Забыли пароль?</Link><br/>Нет аккаунта? <Link href="/signup"><b>Регистрация</b></Link></div>
    </section>
  </main>
}
