"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function LoginPage(){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("Supabase пока не подключён в .env.local.");return;}
    setLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email,password});
    setLoading(false);
    if(error){setMessage(error.message);return;}
    router.push("/platform");
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="eyebrow">WELCOME BACK</div>
      <h1>Войти в EDITA</h1>
      <p>Вернись к обучению, конкурсам, работе и своему AI-наставнику.</p>
      <form className="auth-form" onSubmit={submit}>
        <input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input required type="password" placeholder="Пароль" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="btn btn-dark" disabled={loading}>{loading?"Входим...":"Войти"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <div className="auth-footer">Нет аккаунта? <Link href="/signup"><b>Регистрация</b></Link></div>
    </section>
  </main>
}
