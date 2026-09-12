"use client";

import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {authErrorRu} from "@/lib/auth-errors";

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

    const supabase=getSupabaseBrowserClient();
    setLoading(true);setMessage("");
    const onboarding={role:"business",ageGroup:"18+",goal:"hire",level:"business",software:""};
    localStorage.setItem("edita_onboarding",JSON.stringify(onboarding));
    localStorage.setItem("edita_business_verification_prefill",JSON.stringify({legalName,inn,registrationNumber,websiteUrl:website,socialUrl:social}));

    const {data,error}=await supabase.auth.signUp({
      email:email.trim().toLowerCase(),
      password,
      options:{
        emailRedirectTo:window.location.origin+"/platform",
        data:{
          role:"business",
          display_name:contactName.trim(),
          business_name:businessName.trim(),
          onboarding,
          accepted_terms:true,
          accepted_personal_data:true,
          terms_version:"2026-09-12",
          privacy_version:"2026-09-12"
        }
      }
    });

    setLoading(false);
    if(error){setMessage(authErrorRu(error.message));return;}
    if(data.session){window.location.href="/platform";return;}
    setCreatedEmail(email.trim().toLowerCase());setCooldown(60);
    setMessage("Аккаунт создан. Подтверди email. После входа откроется шаг проверки компании — без него нельзя публиковать реальные вакансии и задания.");
  }

  async function resend(){
    if(!createdEmail||cooldown>0)return;
    const supabase=getSupabaseBrowserClient();
    setLoading(true);
    const {error}=await supabase.auth.resend({type:"signup",email:createdEmail,options:{emailRedirectTo:window.location.origin+"/platform"}});
    setLoading(false);
    if(error){setMessage(authErrorRu(error.message));return;}
    setCooldown(60);setMessage("Письмо отправлено ещё раз.");
  }

  return <main className="auth-wrap"><section className="auth-card auth-card-wide">
    <div className="eyebrow">РЕГИСТРАЦИЯ БИЗНЕСА</div>
    <h1>Создай аккаунт компании</h1>
    <p>После email будет отдельная проверка компании. Только проверенный бизнес сможет публиковать реальные вакансии и задания.</p>

    <div className="business-signup-steps"><span><b>1</b> Аккаунт</span><span><b>2</b> Email</span><span><b>3</b> Документы</span><span><b>4</b> Проверка</span></div>

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
      <input required type="email" autoComplete="email" placeholder="Рабочий email" value={email} onChange={e=>setEmail(e.target.value)}/>
      <input required minLength={8} type="password" autoComplete="new-password" placeholder="Пароль — минимум 8 символов" value={password} onChange={e=>setPassword(e.target.value)}/>

      <label className="consent-row"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/><span>Мне есть 18 лет, и я вправе представлять эту компанию или ИП.</span></label>
      <label className="consent-row"><input type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)}/><span>Я принимаю <Link href="/terms" target="_blank"><u>условия использования</u></Link>.</span></label>
      <label className="consent-row"><input type="checkbox" checked={acceptPersonalData} onChange={e=>setAcceptPersonalData(e.target.checked)}/><span>Я даю <Link href="/personal-data-consent" target="_blank"><u>согласие на обработку персональных данных</u></Link> и прочитал <Link href="/privacy" target="_blank"><u>политику</u></Link>.</span></label>

      <button className="btn btn-dark" disabled={loading||!adult||!acceptTerms||!acceptPersonalData}>{loading?"Создаём…":"Создать бизнес-аккаунт"}</button>
    </form>

    {message&&<div className="auth-msg">{message}</div>}
    {createdEmail&&<div className="auth-resend"><span>Не пришло письмо?</span><button className="btn btn-ghost" onClick={resend} disabled={loading||cooldown>0}>{cooldown>0?"Ещё раз через "+cooldown+" сек":"Отправить ещё раз"}</button></div>}
    <div className="auth-footer"><Link href="/signup">← Выбрать другой тип аккаунта</Link></div>
  </section></main>
}
