"use client";
import Link from "next/link";
import {FormEvent,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function ForgotPassword(){
  const [email,setEmail]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("Production Auth ещё не подключён.");return;}
    setLoading(true);
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+"/reset-password"});
    setLoading(false);
    setMessage(error?error.message:"Письмо для восстановления отправлено.");
  }

  return <main className="auth-wrap"><section className="auth-card">
    <div className="eyebrow">RESET PASSWORD</div><h1>Восстановить доступ</h1>
    <p>Введи email аккаунта EDITA.</p>
    <form className="auth-form" onSubmit={submit}>
      <input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
      <button className="btn btn-dark" disabled={loading}>{loading?"Отправляем…":"Отправить ссылку"}</button>
    </form>
    {message&&<div className="auth-msg">{message}</div>}
    <div className="auth-footer"><Link href="/login">← Вернуться ко входу</Link></div>
  </section></main>
}
