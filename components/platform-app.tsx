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
import SocialHub from "@/components/social-hub";
import BusinessGrowth from "@/components/business-growth";
import SiteTour from "@/components/site-tour";
import BusinessVerification from "@/components/business-verification";
import GuardianVerification from "@/components/guardian-verification";
import EditorVerification from "@/components/editor-verification";

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
  ["home","Главная"],["academy","Академия"],["practice","Практика"],["coach","AI Помощник"],["review","Разбор видео"],
  ["arena","Arena"],["portfolio","Портфолио"],["jobs","Работа"],["community","Сообщество"],["wallet","Оплата и доход"],["profile","Профиль"],["business","Для бизнеса"]
];

export default function PlatformApp(){
 const [tab,setTab]=useState<Tab>("home");
 const [done,setDone]=useState<string[]>([]);
 const [viewer,setViewer]=useState<Viewer>({name:"Гость",role:null,onboarding:{}});
 const [messages,setMessages]=useState([{from:"ai",text:"Привет! Я помогу с монтажом простыми словами. Можешь спросить: «Что такое хук?», «Как сделать ролик интереснее?» или «Куда нажать в CapCut?»"}]);
 const [input,setInput]=useState("");
 const [loading,setLoading]=useState(false);
 const [aiConfigured,setAiConfigured]=useState<boolean|null>(null);
 const [wins,setWins]=useState(0);
 const [businessStats,setBusinessStats]=useState({challenges:0,submissions:0,jobs:0});

 const xp=useMemo(()=>done.reduce((sum,slug)=>sum+(curriculum.find(l=>l.slug===slug)?.xp||0),0),[done]);
 const tabs=useMemo(()=>{
   if(viewer.role==="business") return allTabs.filter(([id])=>["home","coach","review","arena","community","profile","business"].includes(id));
   if(viewer.role==="editor") return allTabs.filter(([id])=>id!=="business");
   return allTabs;
 },[viewer.role]);

 useEffect(()=>{
   fetch("/api/ai/health").then(r=>r.json()).then(d=>setAiConfigured(Boolean(d.connected))).catch(()=>setAiConfigured(false));
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
     const {count:winsCount}=await supabase.from("challenge_submissions")
       .select("id",{count:"exact",head:true})
       .eq("editor_id",data.user.id)
       .eq("status","winner");
     setWins(winsCount||0);

     const {data:progressRows}=await supabase.from("lesson_progress")
       .select("status,lessons(slug)")
       .eq("user_id",data.user.id)
       .eq("status","completed");
     const dbDone=(progressRows||[])
       .map((row:any)=>row.lessons?.slug)
       .filter((slug:any)=>typeof slug==="string");
     if(dbDone.length)setDone(dbDone);
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
     if(profile?.role==="business"){
       setTab("business");
       const {data:ownedBusiness}=await supabase.from("businesses").select("id").eq("owner_id",data.user.id).maybeSingle();
       if(ownedBusiness?.id){
         const {count:challengeCount}=await supabase.from("challenges").select("id",{count:"exact",head:true}).eq("business_id",ownedBusiness.id).eq("status","open");
         const {count:jobCount}=await supabase.from("jobs").select("id",{count:"exact",head:true}).eq("business_id",ownedBusiness.id).eq("status","open");
         const {data:ownedChallenges}=await supabase.from("challenges").select("id").eq("business_id",ownedBusiness.id);
         const ids=(ownedChallenges||[]).map((x:any)=>x.id);
         let submissionCount=0;
         if(ids.length){
           const {count}=await supabase.from("challenge_submissions").select("id",{count:"exact",head:true}).in("challenge_id",ids);
           submissionCount=count||0;
         }
         setBusinessStats({challenges:challengeCount||0,submissions:submissionCount,jobs:jobCount||0});
       }
     }
   });
   const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{
     if(!session)setViewer({name:"Гость",role:null,onboarding:{}});
   });
   return()=>{active=false;listener.subscription.unsubscribe()};
 },[]);

 async function toggleLesson(slug:string){
   const wasDone=done.includes(slug);
   const next=wasDone?done.filter(v=>v!==slug):[...done,slug];
   setDone(next);
   localStorage.setItem("edita_lesson_done",JSON.stringify(next));

   const supabase=getSupabaseBrowserClient();
   const {data:{user}}=await supabase.auth.getUser();
   if(!user)return;
   const {data:lesson}=await supabase.from("lessons").select("id").eq("slug",slug).maybeSingle();
   if(!lesson?.id)return;

   if(wasDone){
     await supabase.from("lesson_progress").delete().eq("user_id",user.id).eq("lesson_id",lesson.id);
   }else{
     await supabase.from("lesson_progress").upsert({
       user_id:user.id,
       lesson_id:lesson.id,
       status:"completed",
       completed_at:new Date().toISOString()
     },{onConflict:"user_id,lesson_id"});
   }
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

 const roleLabel=viewer.role==="business"?"Бизнес":viewer.role==="editor"?"Монтажёр":"Гость";
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

     {tab==="home"&&<Page title={viewer.role?"Продолжай, "+viewer.name+".":"Добро пожаловать в EDITA."} sub={viewer.role?"Если не знаешь, что делать — начни с Академии и первых 5 простых уроков.":"Демо платформы. Пройди короткую настройку, чтобы получить свой маршрут."}>
       <section className="mission"><small>НАЧНИ ОТСЮДА</small><h2>{done.length?"Продолжи следующий урок":"Урок 1: что такое монтаж"}</h2><p>Сначала разберись в простых словах: монтаж, хук, ритм, B-roll, CTA и ТЗ. Потом переходи к практике.</p><button className="btn btn-lime" onClick={()=>setTab("academy")}>Открыть Академию →</button></section>
       <div className="grid">
         <Card title="Твой рост"><div className="stats"><Stat n={viewer.aiScore!=null?String(viewer.aiScore):"—"} t="AI Score"/><Stat n={String(done.length)} t="уроков"/><Stat n={String(wins)} t="побед"/></div></Card>
         <Card title="Arena"><p className="muted">Открытые задания и тренировочные соревнования появляются здесь после публикации.</p><button className="btn btn-dark" onClick={()=>setTab("arena")}>Открыть Arena</button></Card>
         <Card title="Маршрут"><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"freelance"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить цель</Link></Card>
       </div>
     </Page>}

     {tab==="academy"&&<Page title="Академия" sub="Иди сверху вниз. Первые 5 уроков объясняют базу совсем простыми словами, дальше начинается практика.">
       <div className="grid">{curriculum.map((lesson,i)=><div className={"card lesson "+(done.includes(lesson.slug)?"done":"")} key={lesson.slug}>
         <div className="num">{done.includes(lesson.slug)?"✓":i+1}</div>
         <div><div className="eyebrow">{lesson.module}</div><h3>{lesson.title}</h3><p className="muted">{lesson.summary}</p>
           <div className="lesson-actions"><Link className="btn btn-dark" href={"/academy/"+lesson.slug}>Открыть</Link><button className="btn btn-ghost" onClick={()=>toggleLesson(lesson.slug)}>{done.includes(lesson.slug)?"Снять отметку":"+ "+lesson.xp+" XP"}</button></div>
         </div>
       </div>)}</div>
     </Page>}

     {tab==="practice"&&<Page title="Практика" sub="Симулятор реального клиента: цена, правки, сроки и переговоры."><ClientSimulator/></Page>}

     {tab==="coach"&&<Page title="AI Помощник" sub="Спроси про монтаж обычными словами. Если что-то непонятно — попроси объяснить ещё проще.">
       <div className={"ai-status "+(aiConfigured?"online":"offline")}>{aiConfigured===null?"Проверяю AI…":aiConfigured?"● AI подключён":"● AI работает в упрощённом режиме"}</div>
       <div className="card chat"><div className="feed">{messages.map((m,i)=><div className={"bubble "+m.from} key={i}>{m.text}</div>)}{loading&&<div className="bubble">Разбираю…</div>}</div><form className="form" onSubmit={ask}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Почему мой Reel выглядит скучно?"/><button className="btn btn-lime">Спросить</button></form></div>
     </Page>}

     {tab==="review"&&<Page title="Разбор видео" sub="Загрузи ролик. EDITA посмотрит отдельные кадры и простыми словами подскажет, что улучшить.">{viewer.role==="editor"&&viewer.plan!=="pro"?<UpgradePro/>:<VideoReview/>}</Page>}
     {tab==="arena"&&<Page title="Arena" sub="Реальные ТЗ, одинаковые исходники, реальные призы."><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="arena"/></Page>}

     {tab==="portfolio"&&<Page title={viewer.role==="editor"?viewer.name:"Публичное портфолио"} sub="Подтверждённые навыки · реальные работы · понятный профиль">
       <PortfolioPanel/>
       {viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<div style={{marginTop:14}}><GuardianVerification/></div>}
       <div style={{marginTop:14}}>{viewer.username?<Link className="btn btn-dark" href={"/u/"+viewer.username}>Открыть публичный URL</Link>:<Link className="btn btn-dark" href="/u/demo">Посмотреть demo-портфолио</Link>}</div>
     </Page>}

     {tab==="wallet"&&<Page title="Оплата и доход" sub="Здесь видно твой тариф, срок доступа и будущие выплаты.">
       <div className="grid">
         <Card title="Заработано"><div className="wallet-number">{money(viewer.earningsCents||0)}</div><p className="muted">Доход от проектов и заданий после подключения реальных выплат.</p></Card>
         <Card title="Текущий доступ"><div className="wallet-number">{planLabel}</div><p className="muted">{viewer.planExpiresAt?"До "+new Date(viewer.planExpiresAt).toLocaleDateString("ru-RU"):"Без активного срока AI PRO"}</p><Link className="btn btn-dark" href="/pricing">Управлять доступом</Link></Card>
         <Card title="Платежи"><p className="muted">История покупок и выплат появится здесь после одобрения платёжного магазина и первых транзакций.</p></Card>
       </div>
     </Page>}

     {tab==="profile"&&<Page title="Профиль" sub="Навыки, персональный маршрут и публичная карьерная карточка.">
       <div className="profile-grid">
         <Card title="Карточка монтажёра"><p><b>{viewer.name}</b></p><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"freelance"} · {planLabel}</p>{viewer.username&&<Link className="btn btn-dark" href={"/u/"+viewer.username}>Публичный профиль ↗</Link>}</Card>
         <Card title="Навыки"><Skill label="Основа монтажа" value={Math.min(100,done.filter(s=>["what-is-editing","hook-basics","story-basics","retention-basics","editor-words","clean-cut"].includes(s)).length*16)}/><Skill label="Удержание зрителя" value={Math.min(100,done.filter(s=>["hook-basics","retention-basics","hook-2-seconds","subtitles","b-roll","sound"].includes(s)).length*16)}/><Skill label="Работа с клиентом" value={Math.min(100,done.filter(s=>["client-brief","pricing","portfolio"].includes(s)).length*33)}/></Card>
         <Card title="Настройки обучения"><p className="muted">Уровень: {viewer.onboarding?.level||"не указан"}<br/>Программа: {viewer.onboarding?.software||"не указана"}<br/>Цель: {viewer.onboarding?.goal||"не указана"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить настройки</Link></Card><EditorVerification/>{viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<GuardianVerification/>}
       </div>
     </Page>}

     {tab==="jobs"&&<Page title="Работа" sub="Вакансии подбираются по навыкам и подтверждённым работам."><JobBoard mode="editor" ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified}/></Page>}
     {tab==="community"&&<Page title="Сообщество" sub="Рейтинг, друзья, учебные группы, соревнования и приглашения — без лишних личных данных."><SocialHub ageGroup={viewer.onboarding?.ageGroup}/></Page>}
     {tab==="business"&&<Page title="Кабинет бизнеса" sub="Сначала подтвердите компанию. После проверки можно публиковать реальные задания и вакансии."><div className="business-grid"><Stat n={String(businessStats.challenges)} t="активных Challenge"/><Stat n={String(businessStats.submissions)} t="получено работ"/><Stat n={String(businessStats.jobs)} t="открытых вакансий"/><Stat n="ЗАКРЫТО" t="предзапуск"/></div><div className="business-stack"><BusinessVerification/><BusinessGrowth/><BrandBrain viewerName={viewer.name}/><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="business"/><JobBoard mode="business" viewerName={viewer.name}/></div></Page>}
   </section>

   <SiteTour role={viewer.role} onGo={(value)=>setTab(value as Tab)}/>
   <nav className="mobile-nav">{tabs.map(([id,l])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{l}</button>)}</nav>
 </main>
}

function Page({title,sub,children}:{title:string;sub:string;children:React.ReactNode}){return <div className="page"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <div className="card"><h3>{title}</h3>{children}</div>}
function Stat({n,t}:{n:string;t:string}){return <div className="stat"><strong>{n}</strong><span className="muted">{t}</span></div>}
function Job({title,pay}:{title:string;pay:string}){return <div className="card job"><small>УДАЛЁННО</small><h3>{title}</h3><p className="muted">Проверенный бизнес · подбор по портфолио и навыкам</p><b>{pay}</b><button className="btn btn-dark">Податься</button></div>}

function UpgradePro(){return <div className="upgrade-card"><div className="eyebrow">AI PRO</div><h2>Разбор видео входит в AI PRO</h2><p>Персональный разбор по кадрам, таймкодам, началу ролика, ритму, субтитрам и соответствию ТЗ.</p><Link className="btn btn-lime" href="/pricing">Подключить AI PRO · 499 ₽ / 30 дней</Link></div>}
function Skill({label,value}:{label:string;value:number}){return <div className="skill-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><span style={{width:value+"%"}}/></div></div>}
function money(cents:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(cents/100)}
