"use client";

import {FormEvent,useState} from "react";

export default function PrelaunchPage(){
  const [code,setCode]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    setLoading(true);setMessage("");
    try{
      const r=await fetch("/api/prelaunch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});
      const data=await r.json();
      if(!r.ok){setMessage(data?.error||"Код не подошёл.");return;}
      const requested=new URLSearchParams(window.location.search).get("from");
      const destination=requested?.startsWith("/")&&!requested.startsWith("//")?requested:"/review-access";
      window.location.assign(destination);
    }catch{
      setMessage("Не удалось проверить код. Попробуй ещё раз.");
    }finally{setLoading(false)}
  }

  return <main className="prelaunch-page">
    <section className="prelaunch-card">
      <div className="brand">EDITA<span>.</span></div>
      <div className="eyebrow">ЗАКРЫТЫЙ ПРЕДЗАПУСК</div>
      <h1>Сайт уже онлайн,<br/>но пока только для проверки.</h1>
      <p>Введите код доступа. После входа можно проверить регистрацию, обучение, AI, бизнес-кабинет и оплату.</p>
      <form className="auth-form" onSubmit={submit}>
        <input autoFocus required autoComplete="off" placeholder="Код доступа" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
        <button className="btn btn-lime" disabled={loading}>{loading?"Проверяем…":"Открыть EDITA"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <small>После проверки кода вернём туда, куда вы шли. При первом входе откроется страница с демо-доступом.</small>
      <small>Публичный запуск ещё не начался. Поисковые системы закрыты от индексации.</small>
    </section>
  </main>
}
