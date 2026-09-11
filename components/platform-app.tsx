"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import ChallengeCenter from "@/components/challenge-center";
import VideoReview from "@/components/video-review";
import {curriculum} from "@/lib/curriculum";

type Tab="home"|"academy"|"coach"|"review"|"arena"|"portfolio"|"jobs"|"business";
type Onboarding={level?:string;software?:string;goal?:string};
type Viewer={
  name:string;
  role:"editor"|"business"|null;
  username?:string|null;
  plan?:string|null;
  aiScore?:number|null;
  onboarding?:Onboarding;
};

const allTabs:[Tab,string][]=[
  ["home","Главная"],["academy","Академия"],["coach","AI Coach"],["review","AI Review"],
  ["arena","Arena"],["portfolio","Портфолио"],["jobs","Jobs"],["business","Для бизнеса"]
];

export default function PlatformApp(){
 const [tab,setTab]=useState<Tab>("home");
 const [done,setDone]=useState<string[]>([]);
 const [viewer,setViewer]=useState<Viewer>({name:"Гость",role:null,onboarding:{}});
 const [messages,setMessages]=useState([{from:"ai",text:"Привет! Я твой AI-наставник EDITA. Спроси меня про монтаж, портфолио или клиента."}]);
 const [input,setInput]=useState("");
 const [loading,setLoading]=useState(false);
 const [aiConfigured,setAiConfigured]=useState<boolean|null>(null);

 const xp=useMemo(()=>920+done.reduce((sum,slug)=>sum+(curriculum.find(l=>l.slug===slug)?.xp||0),0),[done]);
 const tabs=useMemo(()=>{
   if(viewer.role==="business") return allTabs.filter(([id])=>["home","coach","review","arena","business"].includes(id));
   if(viewer.role==="editor") return allTabs.filter(([id])=>id!=="business");
   return allTabs;
 },[viewer.role]);

 useEffect(()=>{
   fetch("/api/ai").then(r=>r.json()).then(d=>setAiConfigured(Boolean(d.configured))).catch(()=>setAiConfigured(false));
   try{
     const raw=localStorage.getItem("edita_lesson_done");
     if(raw)setDone(JSON.parse(raw));
     const onboardingRaw=localStorage.getItem("edita_onboarding");
     if(onboardingRaw)setViewer(v=>({...v,onboarding:JSON.parse(onboardingRaw)}));
   }catch{}

   const supabase=getSupabaseBrowserClient();
   if(!supabase)return;
   let active=true;
   supabase.auth.getUser().then(async({data})=>{
     if(!active||!data.user)return;
     const {data:profile}=await supabase.from("profiles")
       .select("display_name,role,username,plan,ai_score,onboarding")
       .eq("id",data.user.id).single();
     if(!active)return;
     setViewer({
       name:profile?.display_name||data.user.user_metadata?.display_name||data.user.email?.split("@")[0]||"Пользователь",
       role:profile?.role==="business"?"business":"editor",
       username:profile?.username||null,
       plan:profile?.plan||"free",
       aiScore:profile?.ai_score||null,
       onboarding:profile?.onboarding||data.user.user_metadata?.onboarding||{}
     });
     if(profile?.role==="business")setTab("business");
   });
   const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
     if(!session)setViewer({name:"Гость",role:null,onboarding:{}});
   });
   return()=>{active=false;listener.subscription.unsubscribe()};
 },[]);

 function toggleLesson(slug:string){
   setDone(current=>{
     const next=current.includes(slug)?current.filter(v=>v!==slug):[...current,slug];
     localStorage.setItem("edita_lesson_done",JSON.stringify(next));
     return next;
   });
 }

 async function signOut(){
   const supabase=getSupabaseBrowserClient();
   if(supabase)await supabase.auth.signOut();
   setViewer({name:"Гость",role:null,onboarding:{}});
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
     const r=await fetch("/api/ai",{
       method:"POST",
       headers:{"Content-Type":"application/json"},
       body:JSON.stringify({
         message:q,
         context:{
           level:viewer.onboarding?.level||"unknown",
           xp,
           editor:viewer.onboarding?.software||"CapCut",
           goal:viewer.onboarding?.goal||"freelance",
           role:viewer.role,
           completedLessons:done
         },
         history:messages
       })
     });
     const d=await r.json();
     setMessages(m=>[...m,{from:"ai",text:d.reply||"Не получилось ответить."}]);
   } finally {setLoading(false)}
 }

 const roleLabel=viewer.role==="business"?"Business":viewer.role==="editor"?"Editor":"Demo mode";
 const planLabel=viewer.plan==="pro"?"AI PRO":viewer.plan==="start"?"START":"FREE";

 return <main className="app">
   <aside className="side">
     <Link className="brand" href="/">EDITA<b>.</b></Link>
     <nav className="nav">{tabs.map(([id,l])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{l}</button>)}</nav>
     <div className="profile">
       <b>{viewer.name}</b><br/>
       {roleLabel}{viewer.role==="editor"?" · "+planLabel:""}<br/>
       {viewer.role==="editor"&&<>{xp} XP<br/></>}
       {viewer.username&&<><Link href={"/u/"+viewer.username}>Публичное портфолио ↗</Link><br/></>}
       {viewer.role
         ? <button className="btn" onClick={signOut} style={{marginTop:10}}>Выйти</button>
         : <Link className="btn btn-lime" href="/onboarding" style={{marginTop:10}}>Начать</Link>}
     </div>
   </aside>

   <section className="main">
     <header className="head">
       <b className="mobile">EDITA.</b>
       <div className="user-pill"><span className="user-dot"/><span>{viewer.role?"online":"demo"} · {planLabel}{viewer.role==="editor"?" · "+xp+" XP":""}</span></div>
     </header>

     {tab==="home"&&<Page title={viewer.role?"Продолжай движение, "+viewer.name+".":"Добро пожаловать в EDITA."} sub={viewer.role?"Твой маршрут адаптируется под прогресс, программу и цель.":"Демо платформы. Пройди onboarding, чтобы получить персональный маршрут."}>
       <section className="mission"><small>МИССИЯ ДНЯ</small><h2>Hook за первые 2 секунды</h2><p>Собери 20-секундный Reel и сравни три версии первого кадра.</p><button className="btn btn-lime" onClick={()=>setTab("academy")}>Открыть обучение →</button></section>
       <div className="grid">
         <Card title="Твой рост"><div className="stats"><Stat n={String(viewer.aiScore||82)} t="AI Score"/><Stat n={String(done.length)} t="уроков"/><Stat n="1" t="победа"/></div></Card>
         <Card title="Arena"><p>NORTH COFFEE · 10 000 ₽</p><button className="btn btn-dark" onClick={()=>setTab("arena")}>Участвовать</button></Card>
         <Card title="Маршрут"><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"freelance"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить цель</Link></Card>
       </div>
     </Page>}

     {tab==="academy"&&<Page title="Академия" sub={"Маршрут: "+(viewer.onboarding?.software||"CapCut")+" → "+(viewer.onboarding?.goal||"freelance")+". Реальные уроки + практика."}>
       <div className="grid">{curriculum.map((lesson,i)=><div className={"card lesson "+(done.includes(lesson.slug)?"done":"")} key={lesson.slug}>
         <div className="num">{done.includes(lesson.slug)?"✓":i+1}</div>
         <div><div className="eyebrow">{lesson.module}</div><h3>{lesson.title}</h3><p className="muted">{lesson.summary}</p>
           <div className="lesson-actions"><Link className="btn btn-dark" href={"/academy/"+lesson.slug}>Открыть</Link><button className="btn btn-ghost" onClick={()=>toggleLesson(lesson.slug)}>{done.includes(lesson.slug)?"Снять отметку":"+ "+lesson.xp+" XP"}</button></div>
         </div>
       </div>)}</div>
     </Page>}

     {tab==="coach"&&<Page title="AI Coach" sub="Наставник учитывает твою программу, цель и пройденные уроки.">
       <div className={"ai-status "+(aiConfigured?"online":"offline")}>{aiConfigured===null?"Проверяю AI…":aiConfigured?"● OpenAI подключён":"● Demo mode"}</div>
       <div className="card chat"><div className="feed">{messages.map((m,i)=><div className={"bubble "+m.from} key={i}>{m.text}</div>)}{loading&&<div className="bubble">Разбираю…</div>}</div><form className="form" onSubmit={ask}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Почему мой Reel выглядит скучно?"/><button className="btn btn-lime">Спросить</button></form></div>
     </Page>}

     {tab==="review"&&<Page title="AI Video Review" sub="Загрузи ролик и получи структурированный разбор по кадрам и таймкодам."><VideoReview/></Page>}
     {tab==="arena"&&<Page title="Arena" sub="Реальные ТЗ, одинаковые исходники, реальные призы."><ChallengeCenter role={viewer.role} viewerName={viewer.name} mode="arena"/></Page>}

     {tab==="portfolio"&&<Page title={viewer.role==="editor"?viewer.name:"Публичное портфолио"} sub="Verified Editor · Skill Graph · реальные работы">
       <div className="grid"><Card title="VOLT / Gym Promo"><b>AI Score 91</b></Card><Card title="Finance Expert Reel"><b>AI Score 86</b></Card><Card title="North Coffee"><b>🏆 Challenge Winner</b></Card></div>
       <div style={{marginTop:14}}>{viewer.username?<Link className="btn btn-dark" href={"/u/"+viewer.username}>Открыть публичный URL</Link>:<Link className="btn btn-dark" href="/u/demo">Посмотреть demo-портфолио</Link>}</div>
     </Page>}

     {tab==="jobs"&&<Page title="Работа" sub="Вакансии подбираются по навыкам и подтверждённым работам."><div className="grid"><Job title="Reels-монтажёр" pay="45–60k ₽/мес"/><Job title="YouTube Shorts" pay="2 500 ₽/ролик"/><Job title="UGC ads editor" pay="70k ₽/мес"/></div></Page>}
     {tab==="business"&&<Page title="Business Workspace" sub="Создавайте задания, принимайте работы и нанимайте по реальному результату."><div className="business-grid"><Stat n="2" t="активных конкурса"/><Stat n="126" t="работ"/><Stat n="418" t="талантов"/><Stat n="3.2 дня" t="до найма"/></div><div style={{marginTop:14}}><ChallengeCenter role={viewer.role} viewerName={viewer.name} mode="business"/></div></Page>}
   </section>

   <nav className="mobile-nav">{tabs.map(([id,l])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{l}</button>)}</nav>
 </main>
}

function Page({title,sub,children}:{title:string;sub:string;children:React.ReactNode}){return <div className="page"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <div className="card"><h3>{title}</h3>{children}</div>}
function Stat({n,t}:{n:string;t:string}){return <div className="stat"><strong>{n}</strong><span className="muted">{t}</span></div>}
function Job({title,pay}:{title:string;pay:string}){return <div className="card job"><small>REMOTE</small><h3>{title}</h3><p className="muted">Проверенный бизнес · подбор по portfolio score</p><b>{pay}</b><button className="btn btn-dark">Податься</button></div>}
