"use client";
import {FormEvent,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {authErrorRu} from "@/lib/auth-errors";

export default function ResetPassword(){
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setMessage("Сервис входа ждёт настройки.");return;}
    setLoading(true);
    const {error}=await supabase.auth.updateUser({password});
    setLoading(false);
    setMessage(error?authErrorRu(error.message):"Пароль обновлён. Теперь можно войти.");
  }

  return <main className="auth-wrap"><section className="auth-card">
    <div className="eyebrow">НОВЫЙ ПАРОЛЬ</div><h1>Новый пароль</h1>
    <form className="auth-form" onSubmit={submit}>
      <input required minLength={8} type="password" placeholder="Минимум 8 символов" value={password} onChange={e=>setPassword(e.target.value)}/>
      <button className="btn btn-dark" disabled={loading}>{loading?"Сохраняем…":"Сохранить пароль"}</button>
    </form>
    {message&&<div className="auth-msg">{message}</div>}
    <div className="auth-footer"><Link href="/login">Войти в KIVRONIX</Link></div>
  </section></main>
}
