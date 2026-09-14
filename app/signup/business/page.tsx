"use client";

import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {authErrorRu} from "@/lib/auth-errors";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function BusinessSignup(){
  const [contactName,setContactName]=useState("");
  const [businessName,setBusinessName]=useState("");
  const [legalName,setLegalName]=useState("");
  const [inn,setInn]=useState("");
  const [registrationNumber,setRegistrationNumber]=useState("");
  const [website,setWebsite]=useState("");
  const [social,setSocial]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [adult,setAdult]=useState(false);
  const [acceptTerms,setAcceptTerms]=useState(false);
  const [acceptPersonalData,setAcceptPersonalData]=useState(false);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [createdEmail,setCreatedEmail]=useState("");
  const [cooldown,setCooldown]=useState(0);

  useEffect(()=>{
    if(cooldown<=0)return;
    const timer=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000);
    return()=>window.clearInterval(timer);
  },[cooldown]);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!adult){setMessage("Бизнес-аккаунт может создать только совершеннолетний представитель компании.");return;}
    if(!inn.trim()&&!registrationNumber.trim()){setMessage("Укажи ИНН или ОГРН / ОГРНИП. Это нужно для будущей проверки бизнеса.");return;}
    if(!acceptTerms||!acceptPersonalData){setMessage("Нужно принять условия и отдельно согласиться на обработку персональных данных.");return;}

    setLoading(true);setMessage("");
    const onboarding={role:"business",ageGroup:"18+",goal:"hire",level:"business",software:""};
    localStorage.setItem("kivronix_onboarding",JSON.stringify(onboarding));
    localStorage.setItem("kivronix_business_verification_prefill",JSON.stringify({legalName,inn,registrationNumber,websiteUrl:website,socialUrl:social}));
    const r=await fetch("/api/auth/signup",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({role:"business",displayName:contactName,businessName,email,password,onboarding,referralCode:new URLSearchParams(window.location.search).get("ref")||""})
    });
    const data=await r.json();
    if(!r.ok){setLoading(false);setMessage(authErrorRu(data?.error));return;}
    if(data.instant){
      const supabase=getSupabaseBrowserClient();
      const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
      setLoading(false);
      if(error){setMessage("Аккаунт создан. Войди с этой электронной почтой и паролем на странице входа.");return;}
      window.location.href="/platform";
      return;
    }
    setLoading(false);
    setCreatedEmail(email.trim().toLowerCase());setCooldown(60);
    setMessage("Аккаунт создан. Подтверди электронную почту. После входа пройди проверку компании, чтобы публиковать настоящие вакансии и задания.");
  }

  async function resend(){
    if(!createdEmail||cooldown>0)return;
    setLoading(true);
    const r=await fetch("/api/auth/resend-confirmation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:createdEmail})});
    const data=await r.json();
    setLoading(false);
    if(!r.ok){setMessage(authErrorRu(data?.error));return;}
    setCooldown(60);setMessage("Письмо отправлено ещё раз.");
  }

  return <main className="auth-wrap"><section className="auth-card auth-card-wide">
    <div className="eyebrow">РЕГИСТРАЦИЯ БИЗНЕСА</div>
    <h1>Создай аккаунт компании</h1>
    <p>После проверки вы сможете искать как перспективных новичков, так и профессиональных монтажёров с опытом и портфолио, публиковать вакансии и реальные задания.</p>

    <div className="business-signup-steps"><span><b>1</b> Аккаунт</span><span><b>2</b> Почта</span><span><b>3</b> Документы</span><span><b>4</b> Проверка</span></div>

    <form className="auth-form" onSubmit={submit}>
      <input required placeholder="Имя представителя компании" value={contactName} onChange={e=>setContactName(e.target.value)}/>
      <input required placeholder="Название бренда, которое увидят монтажёры" value={businessName} onChange={e=>setBusinessName(e.target.value)}/>
      <input required placeholder="Официальное название ООО / ИП" value={legalName} onChange={e=>setLegalName(e.target.value)}/>
      <div className="split-fields">
        <input inputMode="numeric" placeholder="ИНН" value={inn} onChange={e=>setInn(e.target.value.replace(/\D/g,"").slice(0,12))}/>
        <input inputMode="numeric" placeholder="ОГРН / ОГРНИП" value={registrationNumber} onChange={e=>setRegistrationNumber(e.target.value.replace(/\D/g,"").slice(0,15))}/>
      </div>
      <input type="url" placeholder="Сайт компании (если есть)" value={website} onChange={e=>setWebsite(e.target.value)}/>
      <input type="url" placeholder="Публичная страница бренда / соцсеть" value={social} onChange={e=>setSocial(e.target.value)}/>
      <input required type="email" autoComplete="email" placeholder="Рабочая электронная почта" value={email} onChange={e=>setEmail(e.target.value)}/>
      <input required minLength={8} type="password" autoComplete="new-password" placeholder="Пароль — минимум 8 символов" value={password} onChange={e=>setPassword(e.target.value)}/>

      <label className="consent-row"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/><span>Мне есть 18 лет, и я вправе представлять эту компанию или ИП.</span></label>
      <label className="consent-row"><input type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)}/><span>Я принимаю <Link href="/terms" target="_blank"><u>условия использования</u></Link>.</span></label>
      <label className="consent-row"><input type="checkbox" checked={acceptPersonalData} onChange={e=>setAcceptPersonalData(e.target.checked)}/><span>Я даю <Link href="/personal-data-consent" target="_blank"><u>согласие на обработку персональных данных</u></Link> и прочитал <Link href="/privacy" target="_blank"><u>политику</u></Link>.</span></label>

      <button className="btn btn-dark" disabled={loading||!adult||!acceptTerms||!acceptPersonalData}>{loading?"Создаём…":"Создать бизнес-аккаунт"}</button>
    </form>

    {message&&<div className="auth-msg">{message}</div>}
    {createdEmail&&<div className="auth-resend"><span>Письмо задержалось?</span><button className="btn btn-ghost" onClick={resend} disabled={loading||cooldown>0}>{cooldown>0?"Ещё раз через "+cooldown+" сек":"Отправить ещё раз"}</button></div>}
    <div className="auth-footer"><Link href="/signup">← Выбрать другой тип аккаунта</Link></div>
  </section></main>
}
