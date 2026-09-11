"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import ChallengeCenter from "@/components/challenge-center";
import VideoReview from "@/components/video-review";
import {curriculum} from "@/lib/curriculum";
import BrandBrain from "@/components/brand-brain";
import ClientSimulator from "@/components/client-simulator";
import PortfolioPanel from "@/components/portfolio-panel";
import JobBoard from "@/components/job-board";
import CommunityLeaderboard from "@/components/community-leaderboard";

type Tab="home"|"academy"|"practice"|"coach"|"review"|"arena"|"portfolio"|"jobs"|"community"|"wallet"|"profile"|"business";
type Onboarding={level?:string;software?:string;goal?:string;ageGroup?:string};
type Viewer={
  name:string;
  role:"editor"|"business"|null;
  username?:string|null;
  plan?:string|null;
  aiScore?:number|null;
  onboarding?:Onboarding;
  earningsCents?:number;
  planExpiresAt?:string|null;
  guardianVerified?:boolean;
};

const allTabs:[Tab,string][]=[
  ["home","Главная"],["academy","Академия"],["practice","Практика"],["coach","AI Coach"],["review","AI Review"],
  ["arena","Arena"],["portfolio","Портфолио"],["jobs","Jobs"],["community","Community"],["wallet","Wallet"],["profile","Профиль"],["business","Для бизнеса"]
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
   if(viewer.role==="business") return allTabs.filter(([id])=>["home","coach","review","arena","community","profile","business"].includes(id));
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
       .select("display_name,role,username,plan,plan_expires_at,ai_score,onboarding,earnings_cents,guardian_verified")
       .eq("id",data.user.id).single();
     if(!active)return;
     setViewer({
       name:profile?.display_name||data.user.user_metadata?.display_name||data.user.email?.split("@")[0]||"Пользователь",
       role:profile?.role==="business"?"business":"editor",
       username:profile?.username||null,
       plan:profile?.plan||"free",
       aiScore:profile?.ai_score||null,
       onboarding:profile?.onboarding||data.user.user_metadata?.onboarding||{},
       earningsCents:Number(profile?.earnings_cents||0),
       planExpiresAt:profile?.plan_expires_at||null,
       guardianVerified:Boolean(profile?.guardian_verified)
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
     const supabase=getSupabaseBrowserClient();
     const {data:{session}}=await supabase.auth.getSession();
     const headers:Record<string,string>={"Content-Type":"application/json"};
     if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
     const r=await fetch("/api/ai",{
       method:"POST",
       headers,
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

     {tab==="practice"&&<Page title="Практика" sub="Симулятор реального клиента: цена, правки, сроки и переговоры."><ClientSimulator/></Page>}

     {tab==="coach"&&<Page title="AI Coach" sub="Наставник учитывает твою программу, цель и пройденные уроки.">
       <div className={"ai-status "+(aiConfigured?"online":"offline")}>{aiConfigured===null?"Проверяю AI…":aiConfigured?"● OpenAI подключён":"● Demo mode"}</div>
       <div className="card chat"><div className="feed">{messages.map((m,i)=><div className={"bubble "+m.from} key={i}>{m.text}</div>)}{loading&&<div className="bubble">Разбираю…</div>}</div><form className="form" onSubmit={ask}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Почему мой Reel выглядит скучно?"/><button className="btn btn-lime">Спросить</button></form></div>
     </Page>}

     {tab==="review"&&<Page title="AI Video Review" sub="Загрузи ролик и получи структурированный разбор по кадрам и таймкодам.">{viewer.role==="editor"&&viewer.plan!=="pro"?<UpgradePro/>:<VideoReview/>}</Page>}
     {tab==="arena"&&<Page title="Arena" sub="Реальные ТЗ, одинаковые исходники, реальные призы."><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="arena"/></Page>}

     {tab==="portfolio"&&<Page title={viewer.role==="editor"?viewer.name:"Публичное портфолио"} sub="Verified Editor · Skill Graph · реальные работы">
       <PortfolioPanel/>
       <div style={{marginTop:14}}>{viewer.username?<Link className="btn btn-dark" href={"/u/"+viewer.username}>Открыть публичный URL</Link>:<Link className="btn btn-dark" href="/u/demo">Посмотреть demo-портфолио</Link>}</div>
     </Page>}

     {tab==="wallet"&&<Page title="Wallet" sub="Доход внутри EDITA, покупки и доступы.">
       <div className="grid">
         <Card title="Заработано"><div className="wallet-number">{money(viewer.earningsCents||0)}</div><p className="muted">Доход от проектов и Challenge после подключения production-выплат.</p></Card>
         <Card title="Текущий доступ"><div className="wallet-number">{planLabel}</div><p className="muted">{viewer.planExpiresAt?"До "+new Date(viewer.planExpiresAt).toLocaleDateString("ru-RU"):"Без активного срока AI PRO"}</p><Link className="btn btn-dark" href="/pricing">Управлять доступом</Link></Card>
         <Card title="Платежи"><p className="muted">После подключения production DB здесь появится история покупок и выплат.</p></Card>
       </div>
     </Page>}

     {tab==="profile"&&<Page title="Профиль" sub="Skill Graph, персональный маршрут и публичная карьерная карточка.">
       <div className="profile-grid">
         <Card title="Career Passport"><p><b>{viewer.name}</b></p><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"freelance"} · {planLabel}</p>{viewer.username&&<Link className="btn btn-dark" href={"/u/"+viewer.username}>Публичный профиль ↗</Link>}</Card>
         <Card title="Skill Graph"><Skill label="Монтаж" value={Math.min(100,55+done.length*5)}/><Skill label="Hook / retention" value={Math.min(100,50+done.filter(s=>["hook-2-seconds","subtitles","b-roll"].includes(s)).length*12)}/><Skill label="Client work" value={Math.min(100,45+done.filter(s=>["client-brief","pricing","portfolio"].includes(s)).length*15)}/></Card>
         <Card title="Настройки маршрута"><p className="muted">Уровень: {viewer.onboarding?.level||"не указан"}<br/>Софт: {viewer.onboarding?.software||"не указан"}<br/>Цель: {viewer.onboarding?.goal||"не указана"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить onboarding</Link></Card>
       </div>
     </Page>}

     {tab==="jobs"&&<Page title="Работа" sub="Вакансии подбираются по навыкам и подтверждённым работам."><JobBoard mode="editor"/></Page>}
     {tab==="community"&&<Page title="Community" sub="Публичный рейтинг строится только на безопасных карьерных данных."><CommunityLeaderboard/></Page>}
     {tab==="business"&&<Page title="Business Workspace" sub="Создавайте задания, храните контекст бренда и нанимайте по реальному результату."><div className="business-grid"><Stat n="2" t="активных конкурса"/><Stat n="126" t="работ"/><Stat n="418" t="талантов"/><Stat n="3.2 дня" t="до найма"/></div><div className="business-stack"><BrandBrain/><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="business"/><JobBoard mode="business"/></div></Page>}
   </section>

   <nav className="mobile-nav">{tabs.map(([id,l])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{l}</button>)}</nav>
 </main>
}

function Page({title,sub,children}:{title:string;sub:string;children:React.ReactNode}){return <div className="page"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <div className="card"><h3>{title}</h3>{children}</div>}
function Stat({n,t}:{n:string;t:string}){return <div className="stat"><strong>{n}</strong><span className="muted">{t}</span></div>}
function Job({title,pay}:{title:string;pay:string}){return <div className="card job"><small>REMOTE</small><h3>{title}</h3><p className="muted">Проверенный бизнес · подбор по portfolio score</p><b>{pay}</b><button className="btn btn-dark">Податься</button></div>}

function UpgradePro(){return <div className="upgrade-card"><div className="eyebrow">AI PRO</div><h2>AI Video Review входит в PRO</h2><p>Персональный разбор по кадрам, таймкодам, hook, pacing, субтитрам и соответствию ТЗ.</p><Link className="btn btn-lime" href="/pricing">Подключить AI PRO · 499 ₽ / 30 дней</Link></div>}
function Skill({label,value}:{label:string;value:number}){return <div className="skill-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><span style={{width:value+"%"}}/></div></div>}
function money(cents:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(cents/100)}
