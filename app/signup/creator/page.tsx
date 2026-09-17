"use client";

import Link from "next/link";
import {FormEvent,useState} from "react";
import {authErrorRu} from "@/lib/auth-errors";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function CreatorSignup(){
  const [name,setName]=useState("");
  const [social,setSocial]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [adult,setAdult]=useState(false);
  const [terms,setTerms]=useState(false);
  const [personal,setPersonal]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!adult||!terms||!personal){setMessage("Подтверди возраст и согласия, чтобы продолжить.");return;}
    try{new URL(social)}catch{setMessage("Вставь полную ссылку на открытый аккаунт, начиная с https://");return;}
    setLoading(true);setMessage("");
    const onboarding={role:"business",accountKind:"creator",ageGroup:"18+",goal:"hire",level:"client",software:"",socialUrl:social.trim()};
    localStorage.setItem("kivronix_onboarding",JSON.stringify(onboarding));
    localStorage.setItem("kivronix_creator_verification_prefill",social.trim());
    const response=await fetch("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:"business",accountKind:"creator",displayName:name,businessName:name,email,password,onboarding})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setLoading(false);setMessage(authErrorRu(data?.error));return;}
    if(data.instant){
      const supabase=getSupabaseBrowserClient();
      const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
      if(!error){window.location.href="/platform";return;}
    }
    setLoading(false);setMessage("Аккаунт создан. Подтверди почту, затем отправь публичный аккаунт на проверку.");
  }

  return <main className="auth-wrap"><section className="auth-card auth-card-wide">
    <div className="eyebrow">РЕГИСТРАЦИЯ ЗАКАЗЧИКА</div><h1>Найди монтажёра для своих роликов</h1>
    <p>Подходит блогерам, экспертам и авторам. В кабинете будут только задания, отклики, аналитика и чаты — без обучения и конкурсов.</p>
    <div className="business-signup-steps"><span><b>1</b> Аккаунт</span><span><b>2</b> Почта</span><span><b>3</b> Соцсеть</span><span><b>4</b> Задания</span></div>
    <form className="auth-form" onSubmit={submit}>
      <label className="field-label" htmlFor="creator-name">Как к тебе обращаться</label>
      <input id="creator-name" required placeholder="Имя или псевдоним" value={name} onChange={e=>setName(e.target.value)}/>
      <label className="field-label" htmlFor="creator-social">Открытая страница</label>
      <input id="creator-social" required type="url" placeholder="Ссылка на Instagram, TikTok, YouTube или VK" value={social} onChange={e=>setSocial(e.target.value)}/>
      <label className="field-label" htmlFor="creator-email">Электронная почта</label>
      <input id="creator-email" required type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
      <label className="field-label" htmlFor="creator-password">Пароль</label>
      <input id="creator-password" required minLength={8} type="password" autoComplete="new-password" placeholder="Минимум 8 символов" value={password} onChange={e=>setPassword(e.target.value)}/>
      <label className="consent-row"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/><span>Мне есть 18 лет.</span></label>
      <label className="consent-row"><input type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)}/><span>Я принимаю <Link href="/terms" target="_blank"><u>условия использования</u></Link>.</span></label>
      <label className="consent-row"><input type="checkbox" checked={personal} onChange={e=>setPersonal(e.target.checked)}/><span>Я согласен на <Link href="/personal-data-consent" target="_blank"><u>обработку персональных данных</u></Link>.</span></label>
      <button className="btn btn-dark" disabled={loading||!adult||!terms||!personal}>{loading?"Создаём…":"Создать аккаунт заказчика"}</button>
    </form>
    {message&&<div className="auth-msg" role="status" aria-live="polite">{message}</div>}<div className="auth-footer"><Link href="/signup">← Выбрать другой тип аккаунта</Link></div>
  </section></main>;
}
