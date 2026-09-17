"use client";

import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {authErrorRu} from "@/lib/auth-errors";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Age="under14"|"14-17"|"18+";

export default function EditorSignup(){
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [ageGroup,setAgeGroup]=useState<Age>("18+");
  const [software,setSoftware]=useState("CapCut Desktop");
  const [operatingSystem,setOperatingSystem]=useState("Windows");
  const [level,setLevel]=useState("new");
  const [goal,setGoal]=useState("freelance");
  const [motivation,setMotivation]=useState("");
  const [schoolName,setSchoolName]=useState("");
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
    if(motivation.trim().length<5){setMessage("Напиши несколькими словами, почему хочешь стать монтажёром.");return;}
    setLoading(true);setMessage("");
    const onboarding={role:"editor",ageGroup,software,operatingSystem,level,goal,motivation:motivation.trim(),schoolName:schoolName.trim()||undefined};
    localStorage.setItem("kivronix_onboarding",JSON.stringify(onboarding));
    const r=await fetch("/api/auth/signup",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({role:"editor",displayName:name,email,password,schoolName,onboarding,referralCode:new URLSearchParams(window.location.search).get("ref")||""})
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
    setMessage("Готово. Письмо отправлено через почтовый сервис KIVRONIX. Проверь Входящие и Спам.");
  }

  async function resend(){
    if(!createdEmail||cooldown>0)return;
    setLoading(true);
    const r=await fetch("/api/auth/resend-confirmation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:createdEmail})});
    const data=await r.json();
    setLoading(false);
    if(!r.ok){setMessage(authErrorRu(data?.error));return;}
    setCooldown(60);setMessage("Письмо отправлено ещё раз. Проверь Входящие и Спам.");
  }

  return <main className="auth-wrap"><section className="auth-card auth-card-wide">
    <div className="eyebrow">РЕГИСТРАЦИЯ МОНТАЖЁРА</div>
    <h1>Создай профиль монтажёра</h1>
    <p>Никаких данных компании. Только то, что помогает настроить обучение и безопасный доступ.</p>{typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("ref")&&<div className="auth-msg"><b>Тебя пригласил друг.</b> После подтверждения электронной почты и первых 3 уроков вы оба получите бонусы внутри KIVRONIX.</div>}

    <form className="auth-form" onSubmit={submit}>
      <label className="field-label" htmlFor="editor-name">Как тебя зовут</label>
      <input id="editor-name" required placeholder="Имя или псевдоним" value={name} onChange={e=>setName(e.target.value)}/>
      <label className="field-label" htmlFor="editor-email">Электронная почта</label>
      <input id="editor-email" required type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
      <label className="field-label" htmlFor="editor-password">Пароль</label>
      <input id="editor-password" required minLength={8} type="password" autoComplete="new-password" placeholder="Минимум 8 символов" value={password} onChange={e=>setPassword(e.target.value)}/>

      <label className="field-label" htmlFor="editor-age">Сколько тебе лет?</label>
      <select id="editor-age" value={ageGroup} onChange={e=>setAgeGroup(e.target.value as Age)}>
        <option value="under14">Мне меньше 14</option>
        <option value="14-17">Мне 14–17</option>
        <option value="18+">Мне 18 или больше</option>
      </select>

      {ageGroup!=="18+"&&<div className="minor-safety-note"><b>Учиться можно сразу.</b><span>Оплата, вакансии и коммерческие задания откроются только после подтверждения родителя или законного представителя.</span></div>}

      <label className="field-label" htmlFor="editor-school">Школа, колледж или вуз — необязательно</label>
      <input id="editor-school" maxLength={160} placeholder="Например: школа № 1253 или РУДН" value={schoolName} onChange={e=>setSchoolName(e.target.value)}/>
      <small className="field-hint">Сохраним только в твоём аккаунте. Включить школу в командный рейтинг можно потом в профиле. Класс, адрес и другие личные данные оставь за пределами формы.</small>

      <label className="field-label" htmlFor="editor-software">В какой программе монтируешь?</label>
      <select id="editor-software" value={software} onChange={e=>{const value=e.target.value;setSoftware(value);if(value==="Final Cut Pro")setOperatingSystem("macOS")}}>
        <option>CapCut Desktop</option><option>Adobe Premiere Pro</option><option>DaVinci Resolve</option><option>Final Cut Pro</option>
      </select>

      <label className="field-label" htmlFor="editor-os">Операционная система</label>
      <select id="editor-os" value={operatingSystem} disabled={software==="Final Cut Pro"} onChange={e=>setOperatingSystem(e.target.value)}>
        <option>Windows</option><option>macOS</option>
      </select>
      {software==="Final Cut Pro"?<small className="field-hint">Final Cut Pro работает на macOS, поэтому система выбрана автоматически.</small>:null}

      <label className="field-label" htmlFor="editor-level">Твой уровень</label>
      <select id="editor-level" value={level} onChange={e=>setLevel(e.target.value)}>
        <option value="new">С нуля</option><option value="beginner">Начинающий</option><option value="intermediate">Уверенный</option><option value="pro">Работаю регулярно</option>
      </select>

      <label className="field-label" htmlFor="editor-goal">Главная цель</label>
      <select id="editor-goal" value={goal} onChange={e=>setGoal(e.target.value)}>
        <option value="freelance">Найти первые заказы</option><option value="reels">Делать короткие вертикальные ролики</option><option value="commercial">Делать видео для брендов и экспертов</option><option value="career">Развиваться как монтажёр</option>
      </select>

      <label className="field-label" htmlFor="editor-motivation">Почему ты хочешь стать монтажёром?</label>
      <textarea id="editor-motivation" required minLength={5} maxLength={500} placeholder="Например: хочу создавать интересные ролики и зарабатывать своим навыком" value={motivation} onChange={e=>setMotivation(e.target.value)}/>
      <div className="signup-points-reward"><b>+5 KIVRONIX Points</b><span>Начислим сразу после создания аккаунта за честный ответ.</span></div>

      <label className="consent-row"><input type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)}/><span>Я принимаю <Link href="/terms" target="_blank"><u>условия использования</u></Link>.</span></label>
      <label className="consent-row"><input type="checkbox" checked={acceptPersonalData} onChange={e=>setAcceptPersonalData(e.target.checked)}/><span>Я даю <Link href="/personal-data-consent" target="_blank"><u>согласие на обработку персональных данных</u></Link> и прочитал <Link href="/privacy" target="_blank"><u>политику</u></Link>.</span></label>

      <button className="btn btn-dark" disabled={loading||!acceptTerms||!acceptPersonalData}>{loading?"Создаём…":"Создать аккаунт монтажёра"}</button>
    </form>

    {message&&<div className="auth-msg" role="status" aria-live="polite">{message}</div>}
    {createdEmail&&<div className="auth-resend"><span>Письмо задержалось?</span><button className="btn btn-ghost" onClick={resend} disabled={loading||cooldown>0}>{cooldown>0?"Ещё раз через "+cooldown+" сек":"Отправить ещё раз"}</button></div>}
    <div className="auth-footer"><Link href="/signup">← Выбрать другой тип аккаунта</Link></div>
  </section></main>
}
