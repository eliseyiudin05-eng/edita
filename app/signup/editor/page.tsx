"use client";

import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {authErrorRu} from "@/lib/auth-errors";

type Age="under14"|"14-17"|"18+";

export default function EditorSignup(){
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [ageGroup,setAgeGroup]=useState<Age>("18+");
  const [software,setSoftware]=useState("CapCut");
  const [level,setLevel]=useState("new");
  const [goal,setGoal]=useState("freelance");
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
    if(!acceptTerms||!acceptPersonalData){setMessage("Нужно принять условия и отдельно согласиться на обработку персональных данных.");return;}
    const supabase=getSupabaseBrowserClient();
    setLoading(true);setMessage("");
    const onboarding={role:"editor",ageGroup,software,level,goal};
    localStorage.setItem("edita_onboarding",JSON.stringify(onboarding));
    const {data,error}=await supabase.auth.signUp({
      email:email.trim().toLowerCase(),
      password,
      options:{
        emailRedirectTo:window.location.origin+"/platform",
        data:{
          role:"editor",
          display_name:name.trim(),
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
    setMessage("Готово. Проверь почту и подтверди email. После входа EDITA сама покажет, куда нажимать.");
  }

  async function resend(){
    if(!createdEmail||cooldown>0)return;
    const supabase=getSupabaseBrowserClient();
    setLoading(true);
    const {error}=await supabase.auth.resend({type:"signup",email:createdEmail,options:{emailRedirectTo:window.location.origin+"/platform"}});
    setLoading(false);
    if(error){setMessage(authErrorRu(error.message));return;}
    setCooldown(60);setMessage("Письмо отправлено ещё раз. Проверь Входящие и Спам.");
  }

  return <main className="auth-wrap"><section className="auth-card auth-card-wide">
    <div className="eyebrow">РЕГИСТРАЦИЯ МОНТАЖЁРА</div>
    <h1>Создай профиль монтажёра</h1>
    <p>Никаких данных компании. Только то, что помогает настроить обучение и безопасный доступ.</p>

    <form className="auth-form" onSubmit={submit}>
      <input required placeholder="Как тебя зовут" value={name} onChange={e=>setName(e.target.value)}/>
      <input required type="email" autoComplete="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
      <input required minLength={8} type="password" autoComplete="new-password" placeholder="Пароль — минимум 8 символов" value={password} onChange={e=>setPassword(e.target.value)}/>

      <label className="field-label">Сколько тебе лет?</label>
      <select value={ageGroup} onChange={e=>setAgeGroup(e.target.value as Age)}>
        <option value="under14">Мне меньше 14</option>
        <option value="14-17">Мне 14–17</option>
        <option value="18+">Мне 18 или больше</option>
      </select>

      {ageGroup!=="18+"&&<div className="minor-safety-note"><b>Учиться можно сразу.</b><span>Оплата, вакансии и коммерческие задания откроются только после подтверждения родителя или законного представителя.</span></div>}

      <label className="field-label">В какой программе монтируешь?</label>
      <select value={software} onChange={e=>setSoftware(e.target.value)}>
        <option>CapCut</option><option>Premiere Pro</option><option>DaVinci Resolve</option><option>Final Cut</option>
      </select>

      <label className="field-label">Твой уровень</label>
      <select value={level} onChange={e=>setLevel(e.target.value)}>
        <option value="new">С нуля</option><option value="beginner">Начинающий</option><option value="intermediate">Уверенный</option><option value="pro">Работаю регулярно</option>
      </select>

      <label className="field-label">Главная цель</label>
      <select value={goal} onChange={e=>setGoal(e.target.value)}>
        <option value="freelance">Найти первые заказы</option><option value="reels">Научиться Reels / TikTok / Shorts</option><option value="youtube">Монтировать YouTube</option><option value="career">Развиваться как профессионал</option>
      </select>

      <label className="consent-row"><input type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)}/><span>Я принимаю <Link href="/terms" target="_blank"><u>условия использования</u></Link>.</span></label>
      <label className="consent-row"><input type="checkbox" checked={acceptPersonalData} onChange={e=>setAcceptPersonalData(e.target.checked)}/><span>Я даю <Link href="/personal-data-consent" target="_blank"><u>согласие на обработку персональных данных</u></Link> и прочитал <Link href="/privacy" target="_blank"><u>политику</u></Link>.</span></label>

      <button className="btn btn-dark" disabled={loading||!acceptTerms||!acceptPersonalData}>{loading?"Создаём…":"Создать аккаунт монтажёра"}</button>
    </form>

    {message&&<div className="auth-msg">{message}</div>}
    {createdEmail&&<div className="auth-resend"><span>Не пришло письмо?</span><button className="btn btn-ghost" onClick={resend} disabled={loading||cooldown>0}>{cooldown>0?"Ещё раз через "+cooldown+" сек":"Отправить ещё раз"}</button></div>}
    <div className="auth-footer"><Link href="/signup">← Выбрать другой тип аккаунта</Link></div>
  </section></main>
}
