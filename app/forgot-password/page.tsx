"use client";
import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {authErrorRu} from "@/lib/auth-errors";

export default function ForgotPassword(){
  const [email,setEmail]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [cooldown,setCooldown]=useState(0);

  useEffect(()=>{
    if(cooldown<=0)return;
    const timer=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000);
    return()=>window.clearInterval(timer);
  },[cooldown]);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(cooldown>0)return;
    setLoading(true);setMessage("");
    const r=await fetch("/api/auth/recovery",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
    const data=await r.json();
    setLoading(false);
    if(!r.ok){setMessage(authErrorRu(data?.error));return;}
    setCooldown(60);
    setMessage("Если аккаунт с таким email существует, письмо для смены пароля отправлено через EDITA. Проверь Входящие и Спам.");
  }

  return <main className="auth-wrap"><section className="auth-card">
    <div className="eyebrow">ВОССТАНОВЛЕНИЕ ДОСТУПА</div><h1>Забыл пароль?</h1>
    <p>Введи email аккаунта EDITA. Мы пришлём ссылку для создания нового пароля.</p>
    <form className="auth-form" onSubmit={submit}>
      <input required type="email" autoComplete="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
      <button className="btn btn-dark" disabled={loading||cooldown>0}>{loading?"Отправляем…":cooldown>0?"Повтор через "+cooldown+" сек":"Отправить ссылку"}</button>
    </form>
    {message&&<div className="auth-msg">{message}</div>}
    <div className="auth-footer"><Link href="/login">← Вернуться ко входу</Link></div>
  </section></main>
}
