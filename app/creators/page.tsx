"use client";

import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import SiteFooter from "@/components/site-footer";

type Brief={
  id:string;slug:string;title:string;short_description:string;brief:string;
  format:string;duration_text:string|null;reward_text:string;rights_text:string;
};

export default function CreatorsPage(){
  const [briefs,setBriefs]=useState<Brief[]>([]);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [join,setJoin]=useState({displayName:"",email:"",socialUrl:"",portfolioUrl:"",preferredFormat:"",desiredRate:"",note:""});
  const [interest,setInterest]=useState({email:"",socialUrl:"",message:""});

  useEffect(()=>{void load()},[]);

  async function load(){
    const supabase=getSupabaseBrowserClient();
    const {data}=await supabase.from("creator_briefs")
      .select("id,slug,title,short_description,brief,format,duration_text,reward_text,rights_text")
      .eq("status","open")
      .order("created_at",{ascending:false});
    setBriefs((data||[]) as Brief[]);
  }

  async function joinProgram(e:FormEvent){
    e.preventDefault();setLoading(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    const {error}=await supabase.from("creator_program_applications").insert({
      user_id:user?.id||null,
      display_name:join.displayName.trim(),
      email:join.email.trim().toLowerCase(),
      social_url:join.socialUrl.trim()||null,
      portfolio_url:join.portfolioUrl.trim()||null,
      preferred_format:join.preferredFormat.trim()||null,
      desired_rate:join.desiredRate.trim()||null,
      note:join.note.trim()||null,
      status:"pending"
    });
    setLoading(false);
    if(error){setMessage("Ошибка отправки заявки: "+error.message);return;}
    setMessage("Заявка в команду KIVRONIX отправлена. Сначала мы согласуем условия и оплату, затем начнётся работа.");
    setJoin({displayName:"",email:"",socialUrl:"",portfolioUrl:"",preferredFormat:"",desiredRate:"",note:""});
  }

  async function wantBrief(briefId:string){
    if(!interest.email.trim()){setMessage("Сначала укажи электронную почту в форме под заданием.");return;}
    setLoading(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    const {error}=await supabase.from("creator_brief_interest").upsert({
      brief_id:briefId,
      user_id:user?.id||null,
      email:interest.email.trim().toLowerCase(),
      social_url:interest.socialUrl.trim()||null,
      message:interest.message.trim()||null,
      status:"interested"
    },{onConflict:"brief_id,email"});
    setLoading(false);
    if(error){setMessage("Ошибка отправки отклика: "+error.message);return;}
    setMessage("Отклик сохранён. До начала работы сначала согласуем оплату, срок и права на использование ролика.");
  }

  return <main className="landing">
    <nav className="topbar shell">
      <Link className="brand" href="/">KIVRONIX<span>.</span></Link>
      <div className="nav-actions"><Link href="/signup/editor">Я монтажёр</Link><Link href="/creators">Для авторов</Link><Link href="/login">Войти</Link></div>
    </nav>

    <section className="hero shell creator-hero">
      <div className="eyebrow">КОМАНДА АВТОРОВ KIVRONIX</div>
      <h1>Снимай про KIVRONIX.<br/><span>Получай оплачиваемые задания.</span></h1>
      <p className="hero-copy">Мы собираем постоянную команду монтажёров и авторов для настоящих задач о платформе KIVRONIX. Условия и оплата согласуются до начала работы.</p>
      <div className="simple-proof"><span>✓ Оплата согласуется заранее</span><span>✓ Можно работать регулярно</span><span>✓ Права на ролик переходят только по договорённости</span></div>
    </section>

    <section className="section shell">
      <div className="section-kicker">КАК ЭТО РАБОТАЕТ</div>
      <div className="steps-road">
        <article><b>1</b><div><h3>Оставь заявку</h3><p>Покажи соцсеть или свои работы. Подойдёт даже маленькая аудитория.</p></div></article>
        <article><b>2</b><div><h3>Получай задания</h3><p>Мы присылаем понятную задачу: формат, срок, важные кадры и место будущего показа ролика.</p></div></article>
        <article><b>3</b><div><h3>Согласуй деньги заранее</h3><p>До съёмки фиксируем оплату, срок и условия использования ролика.</p></div></article>
        <article><b>4</b><div><h3>Работай с нами регулярно</h3><p>Сильные авторы остаются в команде и получают новые задачи по мере их появления.</p></div></article>
      </div>
    </section>

    <section className="section shell">
      <div className="section-kicker">ОФИЦИАЛЬНЫЕ ЗАДАНИЯ</div>
      <h2>Настоящие задачи KIVRONIX</h2>
      <div className="business-stack">
        {briefs.map(brief=><article className="legal-card creator-brief" key={brief.id}>
          <div className="verification-head"><div><div className="eyebrow">KIVRONIX · ОФИЦИАЛЬНОЕ ЗАДАНИЕ</div><h2>{brief.title}</h2></div><span className="verification-badge ok">Открыто</span></div>
          <p>{brief.short_description}</p>
          <div className="challenge-meta"><span>{brief.format}</span><span>{brief.duration_text||"Длительность указана в задании"}</span></div>
          <div className="creator-brief-text">{brief.brief.split("\n").map((line,i)=><p key={i}>{line||" "}</p>)}</div>
          <div className="legal-card"><b>Оплата</b><p>{brief.reward_text}</p></div>
          <div className="legal-card"><b>Права на ролик</b><p>{brief.rights_text}</p></div>

          <div className="business-form creator-interest">
            <input type="email" placeholder="Твоя электронная почта" value={interest.email} onChange={e=>setInterest({...interest,email:e.target.value})}/>
            <input type="url" placeholder="Ссылка на соцсеть или свои работы" value={interest.socialUrl} onChange={e=>setInterest({...interest,socialUrl:e.target.value})}/>
            <textarea placeholder="Коротко: почему хочешь взять это задание" value={interest.message} onChange={e=>setInterest({...interest,message:e.target.value})}/>
            <button className="btn btn-dark" disabled={loading} onClick={()=>wantBrief(brief.id)}>Хочу взять это задание</button>
          </div>
        </article>)}
      </div>
    </section>

    <section className="section shell">
      <div className="section-kicker">ПОСТОЯННАЯ КОМАНДА</div>
      <h2>Подать заявку в команду KIVRONIX</h2>
      <p className="section-lead">Подходит монтажёрам, блогерам и авторам коротких видео. Новичок тоже может попасть в команду с живыми и понятными работами.</p>
      <form className="legal-card business-form" onSubmit={joinProgram}>
        <input required placeholder="Как тебя зовут" value={join.displayName} onChange={e=>setJoin({...join,displayName:e.target.value})}/>
        <input required type="email" placeholder="Электронная почта" value={join.email} onChange={e=>setJoin({...join,email:e.target.value})}/>
        <input type="url" placeholder="Ссылка на соцсеть" value={join.socialUrl} onChange={e=>setJoin({...join,socialUrl:e.target.value})}/>
        <input type="url" placeholder="Ссылка на свои работы (если есть)" value={join.portfolioUrl} onChange={e=>setJoin({...join,portfolioUrl:e.target.value})}/>
        <input placeholder="Что любишь снимать: короткие ролики, обзоры, запись экрана…" value={join.preferredFormat} onChange={e=>setJoin({...join,preferredFormat:e.target.value})}/>
        <input placeholder="Твоя обычная ставка или ожидание по оплате (можно словами)" value={join.desiredRate} onChange={e=>setJoin({...join,desiredRate:e.target.value})}/>
        <textarea placeholder="Пару слов о себе" value={join.note} onChange={e=>setJoin({...join,note:e.target.value})}/>
        <button className="btn btn-lime" disabled={loading}>{loading?"Отправляем…":"Подать заявку в команду"}</button>
      </form>
      {message&&<div className="auth-msg">{message}</div>}
    </section>

    <SiteFooter/>
  </main>
}
