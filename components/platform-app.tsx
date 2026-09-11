"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Tab="home"|"academy"|"coach"|"arena"|"portfolio"|"jobs"|"business";
type Viewer={name:string;role:"editor"|"business"|null};
const tabs:[Tab,string][]=[["home","Главная"],["academy","Академия"],["coach","AI Coach"],["arena","Arena"],["portfolio","Портфолио"],["jobs","Jobs"],["business","Для бизнеса"]];
const lessons=[["Чистая нарезка","Паузы, дыхание, ритм"],["Субтитры","Иерархия, акценты, safe-zone"],["Hook 2 секунды","Удержание внимания"],["Звук","Голос, музыка, саунд-дизайн"]];
const challenges=[["NORTH COFFEE","Reel из утренней съёмки","10 000 ₽"],["VOLT FITNESS","Реклама нового зала","25 000 ₽"],["MOTION LAB","Talking-head Short","7 500 ₽"]];

export default function PlatformApp(){
 const [tab,setTab]=useState<Tab>("home");
 const [done,setDone]=useState([0,1]);
 const [joined,setJoined]=useState<number[]>([]);
 const [viewer,setViewer]=useState<Viewer>({name:"Гость",role:null});
 const [messages,setMessages]=useState([{from:"ai",text:"Привет! Я твой AI-наставник EDITA. Спроси меня про монтаж, портфолио или клиента."}]);
 const [input,setInput]=useState("");
 const [loading,setLoading]=useState(false);
 const xp=useMemo(()=>920+done.length*150,[done]);

 useEffect(()=>{
   const supabase=getSupabaseBrowserClient();
   if(!supabase)return;
   let active=true;
   supabase.auth.getUser().then(async({data})=>{
     if(!active||!data.user)return;
     const {data:profile}=await supabase.from("profiles").select("display_name,role").eq("id",data.user.id).single();
     if(!active)return;
     setViewer({
       name:profile?.display_name||data.user.user_metadata?.display_name||data.user.email?.split("@")[0]||"Пользователь",
       role:profile?.role==="business"?"business":"editor"
     });
     if(profile?.role==="business")setTab("business");
   });
   const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
     if(!session)setViewer({name:"Гость",role:null});
   });
   return()=>{active=false;listener.subscription.unsubscribe()};
 },[]);

 async function signOut(){
   const supabase=getSupabaseBrowserClient();
   if(supabase)await supabase.auth.signOut();
   setViewer({name:"Гость",role:null});
   setTab("home");
 }

 async function ask(e:React.FormEvent){
   e.preventDefault();
   if(!input.trim()||loading)return;
   const q=input;
   setMessages(m=>[...m,{from:"user",text:q}]);
   setInput("");
   setLoading(true);
   try{
     const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,context:{level:5,xp,editor:"CapCut",goal:"первые 30 000 ₽",role:viewer.role}})});
     const d=await r.json();
     setMessages(m=>[...m,{from:"ai",text:d.reply||"Не получилось ответить."}]);
   } finally {setLoading(false)}
 }

 const roleLabel=viewer.role==="business"?"Business":viewer.role==="editor"?"Editor":"Demo mode";

 return <main className="app">
   <aside className="side">
     <Link className="brand" href="/">EDITA<b>.</b></Link>
     <nav className="nav">{tabs.map(([id,l])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{l}</button>)}</nav>
     <div className="profile">
       <b>{viewer.name}</b><br/>
       {roleLabel}{viewer.role==="editor"?" · Level 5":""}<br/>
       {viewer.role==="editor"&&<>{xp} XP<br/></>}
       {viewer.role
         ? <button className="btn" onClick={signOut} style={{marginTop:10}}>Выйти</button>
         : <Link className="btn btn-lime" href="/signup" style={{marginTop:10}}>Регистрация</Link>}
     </div>
   </aside>

   <section className="main">
     <header className="head">
       <b className="mobile">EDITA.</b>
       <div className="user-pill"><span className="user-dot"/><span>{viewer.role?"online":"demo"} · 🔥 8 дней{viewer.role==="editor"?" · "+xp+" XP":""}</span></div>
     </header>

     {tab==="home"&&<Page title={viewer.role?"Продолжай движение, "+viewer.name+".":"Добро пожаловать в EDITA."} sub={viewer.role?"Сегодня прокачиваем удержание зрителя.":"Демо платформы. Зарегистрируйся, чтобы сохранять прогресс и участвовать в реальных заданиях."}>
       <section className="mission"><small>МИССИЯ ДНЯ</small><h2>Hook за первые 2 секунды</h2><p>Собери 20-секундный Reel из учебных исходников и получи +180 XP.</p><button className="btn btn-lime" onClick={()=>setTab("academy")}>Продолжить →</button></section>
       <div className="grid"><Card title="Твой рост"><div className="stats"><Stat n="82" t="AI Score"/><Stat n="7" t="работ"/><Stat n="1" t="победа"/></div></Card><Card title="Arena"><p>NORTH COFFEE · 10 000 ₽</p><button className="btn btn-dark" onClick={()=>setTab("arena")}>Участвовать</button></Card><Card title="Следующий шаг"><p className="muted">Закрой ещё 2 урока — откроются PRO-задания.</p></Card></div>
     </Page>}

     {tab==="academy"&&<Page title="Академия" sub="Персональный маршрут: CapCut → Reels → первые заказы."><div className="grid">{lessons.map((l,i)=><div className={"card lesson "+(done.includes(i)?"done":"")} key={i}><div className="num">{done.includes(i)?"✓":i+1}</div><div><h3>{l[0]}</h3><p className="muted">{l[1]}</p><button className="btn" onClick={()=>setDone(x=>x.includes(i)?x.filter(v=>v!==i):[...x,i])}>{done.includes(i)?"Пройдено":"Начать"}</button></div></div>)}</div></Page>}

     {tab==="coach"&&<Page title="AI Coach" sub="Наставник знает твой уровень, программу и карьерную цель."><div className="card chat"><div className="feed">{messages.map((m,i)=><div className={"bubble "+m.from} key={i}>{m.text}</div>)}{loading&&<div className="bubble">Разбираю…</div>}</div><form className="form" onSubmit={ask}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Почему мой Reel выглядит скучно?"/><button className="btn btn-lime">Спросить</button></form></div></Page>}

     {tab==="arena"&&<Page title="Arena" sub="Реальные ТЗ, одинаковые исходники, реальные призы."><div className="grid">{challenges.map((c,i)=><div className="card challenge" key={i}><small>OPEN CHALLENGE</small><h3>{c[0]}</h3><p>{c[1]}</p><b>{c[2]}</b><div><span className="tag">Reels</span><span className="tag">Real brief</span></div><button className={"btn "+(joined.includes(i)?"btn-lime":"btn-dark")} onClick={()=>setJoined(x=>x.includes(i)?x.filter(v=>v!==i):[...x,i])}>{joined.includes(i)?"✓ Участвуете":"Принять вызов"}</button></div>)}</div></Page>}

     {tab==="portfolio"&&<Page title={viewer.role==="editor"?viewer.name:"Публичное портфолио"} sub="Verified Editor · CapCut · Short-form"><div className="grid"><Card title="VOLT / Gym Promo"><b>AI Score 91</b></Card><Card title="Finance Expert Reel"><b>AI Score 86</b></Card><Card title="North Coffee"><b>🏆 Challenge Winner</b></Card></div></Page>}

     {tab==="jobs"&&<Page title="Работа" sub="Вакансии подбираются по навыкам и подтверждённым работам."><div className="grid"><Job title="Reels-монтажёр" pay="45–60k ₽/мес"/><Job title="YouTube Shorts" pay="2 500 ₽/ролик"/><Job title="UGC ads editor" pay="70k ₽/мес"/></div></Page>}

     {tab==="business"&&<Page title="Business Workspace" sub="Найдите монтажёра по реальной работе, а не по обещаниям."><div className="business-grid"><Stat n="2" t="активных конкурса"/><Stat n="126" t="работ"/><Stat n="418" t="талантов"/><Stat n="3.2 дня" t="до найма"/></div><div className="card" style={{marginTop:14}}><h3>North Coffee — Reel Challenge</h3><p>84 участника → 51 работа → 10 AI shortlist → 1 победитель</p><button className="btn btn-lime">Создать Challenge</button></div></Page>}
   </section>
 </main>
}

function Page({title,sub,children}:{title:string;sub:string;children:React.ReactNode}){return <div className="page"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <div className="card"><h3>{title}</h3>{children}</div>}
function Stat({n,t}:{n:string;t:string}){return <div className="stat"><strong>{n}</strong><span className="muted">{t}</span></div>}
function Job({title,pay}:{title:string;pay:string}){return <div className="card job"><small>REMOTE</small><h3>{title}</h3><p className="muted">Проверенный бизнес · подбор по portfolio score</p><b>{pay}</b><button className="btn btn-dark">Податься</button></div>}
