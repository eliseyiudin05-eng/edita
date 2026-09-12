"use client";
import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {authErrorRu} from "@/lib/auth-errors";

type Role="editor"|"business";
type Onboarding={role?:Role;level?:string;software?:string;goal?:string;ageGroup?:"under14"|"14-17"|"18+"};

export default function SignupPage(){
  const [role,setRole]=useState<Role>("editor");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [onboarding,setOnboarding]=useState<Onboarding>({});
  const [acceptTerms,setAcceptTerms]=useState(false);
  const [acceptPersonalData,setAcceptPersonalData]=useState(false);
  const [createdEmail,setCreatedEmail]=useState("");
  const [resendCooldown,setResendCooldown]=useState(0);

  useEffect(()=>{
    try{
      const raw=localStorage.getItem("edita_onboarding");
      if(!raw)return;
      const data=JSON.parse(raw) as Onboarding;
      setOnboarding(data);
      if(data.role==="business")setRole("business");
    }catch{}
  },[]);

  async function submit(e:FormEvent){
    e.preventDefault();
    setMessage("");
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      setMessage("Регистрация пока работает в demo: production-база/Auth ещё не подключены.");
      return;
    }
    if(role==="business"&&onboarding.ageGroup&&onboarding.ageGroup!=="18+"){
      setMessage("Бизнес-аккаунт доступен только совершеннолетним. Для обучения выбери роль «Монтажёр».");
      return;
    }
    if(!acceptTerms||!acceptPersonalData){
      setMessage("Нужно отдельно принять условия сервиса и согласие на обработку персональных данных.");
      return;
    }
    setLoading(true);
    const {data,error}=await supabase.auth.signUp({
      email,
      password,
      options:{
        emailRedirectTo:window.location.origin+"/platform",
        data:{role,display_name:name,onboarding:{...onboarding,role},accepted_terms:true,accepted_personal_data:true,terms_version:"2026-09-12",privacy_version:"2026-09-12"}
      }
    });
    setLoading(false);
    if(error){setMessage(authErrorRu(error.message));return;}
    if(data.session){
      window.location.href="/platform";
      return;
    }
    setCreatedEmail(email.trim().toLowerCase());
    setResendCooldown(60);
    setMessage("Аккаунт создан. Мы отправили письмо для подтверждения email. Проверь Входящие и папку Спам.");
  }

  return <main className="auth-wrap">
    <section className="auth-card">
      <div className="eyebrow">РЕГИСТРАЦИЯ</div>
      <h1>Создай аккаунт EDITA</h1>
      <p>Выбери, зачем ты пришёл. После входа сайт сам покажет, куда нажимать и с чего начать.</p>
      <div className="role-grid">
        <button type="button" className={"role "+(role==="editor"?"active":"")} onClick={()=>setRole("editor")}><b>Я монтажёр</b><br/><span className="muted">Хочу учиться, делать работы и находить заказы</span></button>
        <button type="button" className={"role "+(role==="business"?"active":"")} onClick={()=>setRole("business")}><b>Я представляю бизнес</b><br/><span className="muted">Хочу дать задание и найти монтажёра</span></button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <input required placeholder="Имя" value={name} onChange={e=>setName(e.target.value)} />
        <input required type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input required minLength={8} type="password" placeholder="Пароль от 8 символов" value={password} onChange={e=>setPassword(e.target.value)} />
        <label className="consent-row"><input type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)}/><span>Я принимаю <Link href="/terms" target="_blank"><u>условия использования</u></Link>.</span></label>
        <label className="consent-row"><input type="checkbox" checked={acceptPersonalData} onChange={e=>setAcceptPersonalData(e.target.checked)}/><span>Я отдельно даю <Link href="/personal-data-consent" target="_blank"><u>согласие на обработку персональных данных</u></Link> и прочитал <Link href="/privacy" target="_blank"><u>политику</u></Link>.</span></label>
        {onboarding.ageGroup&&onboarding.ageGroup!=="18+"&&<div className="minor-safety-note"><b>Тебе нет 18 лет</b><span>Учиться можно сразу. Оплата, вакансии и платные задания будут закрыты, пока родитель или законный представитель не пройдёт подтверждение.</span></div>}
        <button className="btn btn-dark" disabled={loading||!acceptTerms||!acceptPersonalData}>{loading?"Создаём...":"Создать аккаунт"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
      <div className="auth-footer"><Link href="/onboarding">← Изменить маршрут</Link> · Уже есть аккаунт? <Link href="/login"><b>Войти</b></Link></div>
    </section>
  </main>
}
