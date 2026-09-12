"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import ChallengeCenter from "@/components/challenge-center";
import VideoReview from "@/components/video-review";
import {curriculum,curriculumModules,curriculumStats} from "@/lib/curriculum";
import AiCoach from "@/components/ai-coach";
import BrandBrain from "@/components/brand-brain";
import ClientSimulator from "@/components/client-simulator";
import PortfolioPanel from "@/components/portfolio-panel";
import JobBoard from "@/components/job-board";
import SocialHub from "@/components/social-hub";
import BusinessGrowth from "@/components/business-growth";
import CampaignHub from "@/components/campaign-hub";
import SiteTour from "@/components/site-tour";
import BusinessVerification from "@/components/business-verification";
import GuardianVerification from "@/components/guardian-verification";
import EditorVerification from "@/components/editor-verification";
import ProfileEditor from "@/components/profile-editor";
import ProfileAvatar from "@/components/profile-avatar";
import BetaUpgradeButton from "@/components/beta-upgrade-button";

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
  avatarUrl?:string|null;
  schoolName?:string|null;
};

const allTabs:[Tab,string][]=[
  ["home","Главная"],["academy","Академия"],["practice","Практика"],["coach","AI Помощник"],["review","Разбор видео"],
  ["arena","Arena"],["portfolio","Портфолио"],["jobs","Работа"],["community","Сообщество"],["wallet","Доступ и доход"],["profile","Профиль"],["business","Для бизнеса"]
];

export default function PlatformApp(){
 const [tab,setTab]=useState<Tab>("home");
 const [done,setDone]=useState<string[]>([]);
 const [viewer,setViewer]=useState<Viewer>({name:"Гость",role:null,onboarding:{}});
 const [wins,setWins]=useState(0);
 const [businessStats,setBusinessStats]=useState({challenges:0,submissions:0,jobs:0});

 const xp=useMemo(()=>done.reduce((sum,slug)=>sum+(curriculum.find(l=>l.slug===slug)?.xp||0),0),[done]);
 const tabs=useMemo(()=>{
   if(viewer.role==="business") return allTabs.filter(([id])=>["home","coach","review","arena","profile","business"].includes(id));
   if(viewer.role==="editor") return allTabs.filter(([id])=>id!=="business");
   return allTabs;
 },[viewer.role]);

 useEffect(()=>{
   const hash=window.location.hash.replace("#","") as Tab;
   if(allTabs.some(([id])=>id===hash))setTab(hash);
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
       .select("display_name,role,username,plan,plan_expires_at,ai_score,onboarding,earnings_cents,guardian_verified,avatar_url,school_name")
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
     setDone(dbDone);
     try{localStorage.setItem("edita_lesson_done",JSON.stringify(dbDone))}catch{}
     setViewer({
       name:profile?.display_name||data.user.user_metadata?.display_name||data.user.email?.split("@")[0]||"Пользователь",
       role:profile?.role==="business"?"business":"editor",
       username:profile?.username||null,
       plan:profile?.plan||"free",
       aiScore:profile?.ai_score||null,
       onboarding:profile?.onboarding||data.user.user_metadata?.onboarding||{},
       earningsCents:Number(profile?.earnings_cents||0),
       planExpiresAt:profile?.plan_expires_at||null,
       guardianVerified:Boolean(profile?.guardian_verified),
       avatarUrl:profile?.avatar_url||null,
       schoolName:profile?.school_name||null
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

 function goTab(next:Tab){
   setTab(next);
   window.history.replaceState(null,"","#"+next);
   window.scrollTo({top:0,behavior:"smooth"});
 }

 async function signOut(){
   const supabase=getSupabaseBrowserClient();
   if(supabase)await supabase.auth.signOut();
   setViewer({name:"Гость",role:null,onboarding:{}});
   setTab("home");
 }

 const roleLabel=viewer.role==="business"?"Бизнес":viewer.role==="editor"?"Монтажёр":"Гость";
 const proActive=viewer.plan==="pro"&&(!viewer.planExpiresAt||new Date(viewer.planExpiresAt).getTime()>Date.now());
 const planLabel=proActive?"AI PRO":viewer.plan==="start"?"START":"FREE";

 return <main className="app">
   <aside className="side">
     <Link className="brand" href="/platform#home">EDITA<b>.</b></Link>
     <nav className="nav">{tabs.map(([id,l])=><button className={tab===id?"active":""} onClick={()=>goTab(id)} key={id}>{l}</button>)}</nav>
     <div className="profile">
       <div className="side-profile-head"><ProfileAvatar src={viewer.avatarUrl} name={viewer.name} size="sm"/><b>{viewer.name}</b></div>
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
       <button type="button" className="app-back-button" onClick={()=>tab==="home"?window.history.back():goTab("home")}>← Назад</button>
       <b className="mobile">EDITA.</b>
       <div className="user-pill"><ProfileAvatar src={viewer.avatarUrl} name={viewer.name} size="sm"/><span>{viewer.role?"online":"demo"} · {planLabel}{viewer.role==="editor"?" · "+xp+" XP":""}</span></div>
     </header>

     {tab==="home"&&<Page title={viewer.role?"Продолжай, "+viewer.name+".":"Добро пожаловать в EDITA."} sub={viewer.role?"Если не знаешь, что делать — продолжи маршрут с ближайшего незавершённого урока.":"Демо платформы. Войди одним нажатием, чтобы AI-диалоги и прогресс сохранялись."}>
       <section className="mission"><small>ТВОЙ МАРШРУТ</small><h2>{done.length?"Продолжи следующий урок":"Первый Reel — с самой первой кнопки"}</h2><p>{curriculum.length} коротких уроков ведут от установки CapCut и первой склейки до цвета, звука, портфолио и работы с клиентом.</p><button className="btn btn-lime" onClick={()=>goTab("academy")}>Продолжить в Академии →</button></section>
       <div className="grid">
         <Card title="Твой рост"><div className="stats"><Stat n={viewer.aiScore!=null?String(viewer.aiScore):"—"} t="AI Score"/><Stat n={String(done.length)} t="уроков"/><Stat n={String(wins)} t="побед"/></div></Card>
         <Card title="Конкурс EDITA"><p className="muted">Сезон на 10 000 ₽, правила и рейтинг просмотров находятся в Сообществе.</p><button className="btn btn-dark" onClick={()=>goTab("community")}>Открыть соревнование</button></Card>
         <Card title="Маршрут"><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"freelance"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить цель</Link></Card>
       </div>
     </Page>}

     {tab==="academy"&&<Page title="Академия" sub="От первого запуска программы до сильного портфолио. Каждый урок — объяснение, карта кнопок, практика, проверка и AI рядом.">
       <div className="academy-overview">
         <Stat n={String(curriculumStats.lessons)} t="уроков"/><Stat n={Math.round(curriculumStats.minutes/60)+" ч"} t="практики"/><Stat n={String(curriculumStats.assignments)} t="заданий"/><Stat n={String(done.length)} t="пройдено"/>
       </div>
       <div className="academy-route-note"><b>Не знаешь, с чего начать?</b><span>Открой первый модуль и иди сверху вниз. Сложность растёт постепенно; продвинутые эффекты не появятся раньше первой готовой работы.</span></div>
       <div className="academy-modules">{curriculumModules.map((group,moduleIndex)=><section className="academy-module" key={group.module}>
         <header><div><div className="eyebrow">СТУПЕНЬ {moduleIndex+1}</div><h2>{group.module}</h2></div><span>{group.lessons.filter(item=>done.includes(item.slug)).length} / {group.lessons.length}</span></header>
         <div className="academy-lesson-grid">{group.lessons.map(lesson=>{
           const lessonIndex=curriculum.findIndex(item=>item.slug===lesson.slug);
           const unlocked=lessonIndex===0||curriculum.slice(0,lessonIndex).every(item=>done.includes(item.slug));
           return <article className={"academy-lesson-card "+(done.includes(lesson.slug)?"done ":"")+(unlocked?"":"locked")} key={lesson.slug}>
             <div className="academy-lesson-top"><span className="num">{done.includes(lesson.slug)?"✓":unlocked?lessonIndex+1:"—"}</span><div><small>{lesson.level} · {lesson.minutes} мин</small><b>{unlocked?lesson.software:"Откроется после задания"}</b></div></div>
             <h3>{lesson.title}</h3><p>{lesson.summary}</p>
             <div className="academy-tags"><span>{lesson.track}</span>{lesson.clicks?.length?<span>Карта кнопок</span>:null}<span>AI в уроке</span></div>
             <div className="lesson-actions">{unlocked?<Link className="btn btn-dark" href={"/academy/"+lesson.slug}>Открыть урок</Link>:<button className="btn btn-ghost" disabled>Сначала выполни предыдущее задание</button>}<span className="lesson-xp">+{lesson.xp} XP</span></div>
           </article>
         })}</div>
       </section>)}</div>
     </Page>}

     {tab==="practice"&&<Page title="Практика" sub="Симулятор реального клиента: цена, правки, сроки и переговоры."><ClientSimulator/></Page>}

     {tab==="coach"&&<Page title="AI Помощник" sub="Спроси про монтаж обычными словами. Ответ придёт короткими блоками, со шагами, проверкой и лайфхаком.">
       <AiCoach
         scopeKey="main"
         title="EDITA AI Coach"
         prompts={["Я впервые открыл CapCut. С чего начать?","Помоги сделать Reel за 30 минут","Почему мой ролик выглядит скучно?","Объясни мой следующий урок"]}
         context={{
           level:viewer.onboarding?.level||"unknown",
           xp,
           editor:viewer.onboarding?.software||"CapCut",
           goal:viewer.onboarding?.goal||"freelance",
           role:viewer.role,
           plan:proActive?"pro":viewer.plan||"free",
           completedLessons:done
         }}
       />
     </Page>}

     {tab==="review"&&<Page title="Разбор видео" sub="Загрузи ролик. EDITA посмотрит отдельные кадры и простыми словами подскажет, что улучшить.">{viewer.role==="editor"&&!proActive?<UpgradePro/>:<VideoReview/>}</Page>}
     {tab==="arena"&&<Page title="Arena" sub="Реальные ТЗ, одинаковые исходники, реальные призы."><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="arena"/></Page>}

     {tab==="portfolio"&&<Page title={viewer.role==="editor"?viewer.name:"Публичное портфолио"} sub="Подтверждённые навыки · реальные работы · понятный профиль">
       <PortfolioPanel/>
       {viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<div style={{marginTop:14}}><GuardianVerification/></div>}
       <div style={{marginTop:14}}>{viewer.username?<Link className="btn btn-dark" href={"/u/"+viewer.username}>Открыть публичный URL</Link>:<Link className="btn btn-dark" href="/u/demo">Посмотреть demo-портфолио</Link>}</div>
     </Page>}

     {tab==="wallet"&&<Page title="Доступ и доход" sub="Во время беты списаний нет. Здесь видно уровень доступа и будущие выплаты.">
       <div className="grid">
         <Card title="Заработано"><div className="wallet-number">{money(viewer.earningsCents||0)}</div><p className="muted">Доход от проектов и заданий после подключения реальных выплат.</p></Card>
         <Card title="Текущий доступ"><div className="wallet-number">{planLabel}</div><p className="muted">{viewer.planExpiresAt?"До "+new Date(viewer.planExpiresAt).toLocaleDateString("ru-RU"):"Без активного срока AI PRO"}</p><Link className="btn btn-dark" href="/pricing">Управлять доступом</Link></Card>
         <Card title="Бета без кассы"><p className="muted">Покупки отключены до завершения проверки. История появится только после официального подключения платежей.</p></Card>
       </div>
     </Page>}

     {tab==="profile"&&<Page title="Профиль" sub="Навыки, персональный маршрут и публичная карьерная карточка.">
       <div className="profile-grid">
         <ProfileEditor onSaved={profile=>setViewer(current=>({...current,name:profile.displayName,username:profile.username,avatarUrl:profile.avatarUrl,schoolName:profile.schoolName}))}/>
         <Card title="Карточка монтажёра"><p><b>{viewer.name}</b></p><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"freelance"} · {planLabel}{viewer.schoolName?" · "+viewer.schoolName:""}</p>{viewer.username&&<Link className="btn btn-dark" href={"/u/"+viewer.username}>Публичный профиль ↗</Link>}</Card>
         <Card title="Навыки"><Skill label="Основа монтажа" value={Math.min(100,done.filter(s=>["what-is-editing","hook-basics","story-basics","retention-basics","editor-words","clean-cut"].includes(s)).length*16)}/><Skill label="Удержание зрителя" value={Math.min(100,done.filter(s=>["hook-basics","retention-basics","hook-2-seconds","subtitles","b-roll","sound"].includes(s)).length*16)}/><Skill label="Работа с клиентом" value={Math.min(100,done.filter(s=>["client-brief","pricing","portfolio"].includes(s)).length*33)}/></Card>
         <Card title="Настройки обучения"><p className="muted">Уровень: {viewer.onboarding?.level||"не указан"}<br/>Программа: {viewer.onboarding?.software||"не указана"}<br/>Цель: {viewer.onboarding?.goal||"не указана"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить настройки</Link></Card><EditorVerification/>{viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<GuardianVerification/>}
       </div>
     </Page>}

     {tab==="jobs"&&<Page title="Работа" sub="Вакансии и маркетинговые кампании проверенных компаний — в одном месте."><div className="business-stack"><CampaignHub mode="editor"/><JobBoard mode="editor" ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified}/></div></Page>}
     {tab==="community"&&<Page title="Сообщество" sub="Рейтинг, друзья, учебные группы, соревнования и приглашения — без лишних личных данных."><SocialHub ageGroup={viewer.onboarding?.ageGroup}/></Page>}
     {tab==="business"&&<Page title="Кабинет бизнеса" sub="Сначала подтвердите компанию. После проверки можно публиковать реальные задания и вакансии."><div className="business-grid"><Stat n={String(businessStats.challenges)} t="активных Challenge"/><Stat n={String(businessStats.submissions)} t="получено работ"/><Stat n={String(businessStats.jobs)} t="открытых вакансий"/><Stat n="ЗАКРЫТО" t="предзапуск"/></div><div className="business-stack"><BusinessVerification/><BusinessGrowth/><CampaignHub mode="business"/><BrandBrain viewerName={viewer.name}/><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="business"/><JobBoard mode="business" viewerName={viewer.name}/></div></Page>}
   </section>

   <SiteTour role={viewer.role} onGo={(value)=>goTab(value as Tab)}/>
   <nav className="mobile-nav">{tabs.map(([id,l])=><button key={id} className={tab===id?"active":""} onClick={()=>goTab(id)}>{l}</button>)}</nav>
 </main>
}

function Page({title,sub,children}:{title:string;sub:string;children:React.ReactNode}){return <div className="page"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <div className="card"><h3>{title}</h3>{children}</div>}
function Stat({n,t}:{n:string;t:string}){return <div className="stat"><strong>{n}</strong><span className="muted">{t}</span></div>}
function Job({title,pay}:{title:string;pay:string}){return <div className="card job"><small>УДАЛЁННО</small><h3>{title}</h3><p className="muted">Проверенный бизнес · подбор по портфолио и навыкам</p><b>{pay}</b><button className="btn btn-dark">Податься</button></div>}

function UpgradePro(){return <div className="upgrade-card"><div className="eyebrow">AI PRO · БЕТА</div><h2>Включи максимальный разбор бесплатно</h2><p>Во время закрытой беты первые 50 участников тестируют PRO без карты: кадры, таймкоды, начало ролика, ритм, субтитры и соответствие ТЗ.</p><BetaUpgradeButton/></div>}
function Skill({label,value}:{label:string;value:number}){return <div className="skill-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><span style={{width:value+"%"}}/></div></div>}
function money(cents:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(cents/100)}
