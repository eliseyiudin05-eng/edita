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
import KivronixChallenges from "@/components/kivronix-challenges";
import PrivateChats from "@/components/private-chats";
import {futurePlans} from "@/lib/plans";

type Tab="home"|"academy"|"practice"|"coach"|"review"|"kivronix-challenges"|"arena"|"portfolio"|"jobs"|"messages"|"community"|"wallet"|"plans"|"profile"|"business";
type Onboarding={level?:string;software?:string;goal?:string;ageGroup?:string};
type Viewer={
  name:string;
  role:"editor"|"business"|null;
  username?:string|null;
  aiScore?:number|null;
  onboarding?:Onboarding;
  earningsCents?:number;
  guardianVerified?:boolean;
  avatarUrl?:string|null;
  schoolName?:string|null;
  plan?:string|null;
  planExpiresAt?:string|null;
  referralPoints?:number;
};

const allTabs:[Tab,string][]=[
  ["home","Главная"],["academy","Обучение"],["practice","Практика"],["coach","Помощник"],["review","Разбор видео"],
  ["kivronix-challenges","Конкурсы KIVRONIX"],["arena","Конкурсы компаний"],["portfolio","Мои работы"],["jobs","Работа"],["messages","Закрытые чаты"],["community","Сообщество"],["wallet","Мои итоги"],["plans","Тариф и доступ"],["profile","Профиль"],["business","Компания"]
];

export default function PlatformApp(){
 const [tab,setTab]=useState<Tab>("home");
 const [done,setDone]=useState<string[]>([]);
 const [viewer,setViewer]=useState<Viewer>({name:"Гость",role:null,onboarding:{}});
 const [wins,setWins]=useState(0);
 const [businessStats,setBusinessStats]=useState({challenges:0,submissions:0,jobs:0});

 const xp=useMemo(()=>done.reduce((sum,slug)=>sum+(curriculum.find(l=>l.slug===slug)?.xp||0),0),[done]);
 const tabs=useMemo(()=>{
   if(viewer.role==="business") return allTabs.filter(([id])=>["home","coach","review","arena","messages","plans","profile","business"].includes(id));
   if(viewer.role==="editor") return allTabs.filter(([id])=>id!=="business");
   return allTabs;
 },[viewer.role]);

 useEffect(()=>{
   const syncTabFromHash=()=>{
     const hash=window.location.hash.replace("#","") as Tab;
     if(allTabs.some(([id])=>id===hash))setTab(hash);
   };
   syncTabFromHash();
   window.addEventListener("hashchange",syncTabFromHash);
   try{
     const raw=localStorage.getItem("kivronix_lesson_done");
     if(raw)setDone(JSON.parse(raw));
     const onboardingRaw=localStorage.getItem("kivronix_onboarding");
     if(onboardingRaw)setViewer(v=>({...v,onboarding:JSON.parse(onboardingRaw)}));
   }catch{}

   const supabase=getSupabaseBrowserClient();
   if(!supabase)return;
   let active=true;
   supabase.auth.getUser().then(async({data})=>{
     if(!active||!data.user)return;
     const {data:profile}=await supabase.from("profiles")
       .select("display_name,role,username,ai_score,onboarding,earnings_cents,guardian_verified,avatar_url,school_name,plan,plan_expires_at,referral_points")
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
     try{localStorage.setItem("kivronix_lesson_done",JSON.stringify(dbDone))}catch{}
     setViewer({
       name:profile?.display_name||data.user.user_metadata?.display_name||data.user.email?.split("@")[0]||"Пользователь",
       role:profile?.role==="business"?"business":"editor",
       username:profile?.username||null,
       aiScore:profile?.ai_score||null,
       onboarding:profile?.onboarding||data.user.user_metadata?.onboarding||{},
       earningsCents:Number(profile?.earnings_cents||0),
       guardianVerified:Boolean(profile?.guardian_verified),
       avatarUrl:profile?.avatar_url||null,
       schoolName:profile?.school_name||null,
       plan:profile?.plan||null,
       planExpiresAt:profile?.plan_expires_at||null,
       referralPoints:Number(profile?.referral_points||0)
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
   return()=>{active=false;window.removeEventListener("hashchange",syncTabFromHash);listener.subscription.unsubscribe()};
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
 const activePaidPlan=Boolean(viewer.plan&&viewer.plan!=="free"&&viewer.planExpiresAt&&new Date(viewer.planExpiresAt).getTime()>Date.now());
 const accessLabel:string=activePaidPlan?(viewer.plan==="creator_plus"?"Creator+":viewer.plan==="studio_plus"?"Studio+":viewer.plan||"платный план"):"ранний доступ";

 return <main className="app">
   <aside className="side">
     <Link className="brand" href="/platform#home">KIVRONIX<b>.</b></Link>
     <nav className="nav">{tabs.map(([id,l])=><button className={tab===id?"active":""} onClick={()=>goTab(id)} key={id}>{l}</button>)}</nav>
     <div className="profile">
       <div className="side-profile-head"><ProfileAvatar src={viewer.avatarUrl} name={viewer.name} size="sm"/><b>{viewer.name}</b></div>
       {roleLabel}{viewer.role?" · "+accessLabel:""}<br/>
       {viewer.role==="editor"&&<>{xp} опыта<br/></>}
       {viewer.username&&<><Link href={"/u/"+viewer.username}>Страница с работами ↗</Link><br/></>}
       {viewer.role
         ? <button className="btn" onClick={signOut} style={{marginTop:10}}>Выйти</button>
         : <Link className="btn btn-lime" href="/onboarding" style={{marginTop:10}}>Начать</Link>}
     </div>
   </aside>

   <section className="main">
     <header className="head">
       <button type="button" className="app-back-button" onClick={()=>tab==="home"?window.history.back():goTab("home")}>← Назад</button>
       <b className="mobile">KIVRONIX.</b>
       <div className="user-pill"><ProfileAvatar src={viewer.avatarUrl} name={viewer.name} size="sm"/><span>{viewer.role?"в сети":"пример"} · {accessLabel}{viewer.role==="editor"?" · "+xp+" опыта":""}</span></div>
     </header>

     {tab==="home"&&<Page title={viewer.role?"Продолжай, "+viewer.name+".":"Добро пожаловать в KIVRONIX."} sub={viewer.role?"Открой ближайший урок и двигайся по шагам.":"Посмотри платформу. После входа помощник и учебный прогресс сохраняются."}>
       <section className="mission"><small>ТВОЙ ПУТЬ</small><h2>{done.length?"Продолжи следующий урок":"Первый ролик начинается с одной кнопки"}</h2><p>{curriculum.length} коротких уроков ведут от установки CapCut и первой склейки до цвета, звука, своих работ и общения с заказчиком.</p><button className="btn btn-lime" onClick={()=>goTab("academy")}>Продолжить обучение →</button></section>
       <div className="grid">
         <Card title="Твой рост"><div className="stats"><Stat n={viewer.aiScore!=null?String(viewer.aiScore):"—"} t="оценка ролика"/><Stat n={String(done.length)} t="уроков"/><Stat n={String(wins)} t="побед"/></div></Card>
         <Card title="Конкурс KIVRONIX"><p className="muted">Приз 10 000 ₽: опубликуй короткий ролик, отметь KIVRONIX и участвуй в честном рейтинге просмотров.</p><button className="btn btn-dark" onClick={()=>goTab("kivronix-challenges")}>Открыть конкурс</button></Card>
         <Card title="Твой путь"><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"свои проекты"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить цель</Link></Card>
       </div>
     </Page>}

     {tab==="academy"&&<Page title="Обучение" sub="Сначала простое объяснение. Затем установка программы, картинки с нужными кнопками, маленькие задания и помощник KIVRONIX.">
       <div className="academy-overview">
         <Stat n={String(curriculumStats.lessons)} t="уроков"/><Stat n={String(curriculumStats.theory)} t="уроков теории"/><Stat n={String(curriculumStats.assignments)} t="заданий"/><Stat n={String(done.length)} t="пройдено"/>
       </div>
       <div className="academy-route-note"><b>Начни с первого шага</b><span>Открой первый раздел и иди сверху вниз. Сложность растёт постепенно, а продвинутые эффекты появятся после первой готовой работы.</span></div>
       <div className="academy-modules">{curriculumModules.map((group,moduleIndex)=><section className="academy-module" key={group.module}>
         <header><div><div className="eyebrow">СТУПЕНЬ {moduleIndex+1}</div><h2>{group.module}</h2></div><span>{group.lessons.filter(item=>done.includes(item.slug)).length} / {group.lessons.length}</span></header>
         <div className="academy-lesson-grid">{group.lessons.map(lesson=>{
           const lessonIndex=curriculum.findIndex(item=>item.slug===lesson.slug);
           const unlocked=lessonIndex===0||curriculum.slice(0,lessonIndex).every(item=>done.includes(item.slug));
           return <article className={"academy-lesson-card "+(done.includes(lesson.slug)?"done ":"")+(unlocked?"":"locked")} key={lesson.slug}>
             <div className="academy-lesson-top"><span className="num">{done.includes(lesson.slug)?"✓":unlocked?lessonIndex+1:"—"}</span><div><small>{lesson.level} · {lesson.minutes} мин</small><b>{unlocked?lesson.software:"Откроется после предыдущего урока"}</b></div></div>
             <h3>{lesson.title}</h3><p>{lesson.summary}</p>
             <div className="academy-tags"><span>{lesson.track}</span><span>{lesson.theoryOnly?"Простое объяснение":"Наглядная схема"}</span>{lesson.clicks?.length?<span>Карта кнопок</span>:null}<span>Помощник в уроке</span></div>
             <div className="lesson-actions">{unlocked?<Link className="btn btn-dark" href={"/academy/"+lesson.slug}>Открыть урок</Link>:<button className="btn btn-ghost" disabled>Сначала заверши предыдущий урок</button>}<span className="lesson-xp">+{lesson.xp} опыта</span></div>
           </article>
         })}</div>
       </section>)}</div>
     </Page>}

     {tab==="practice"&&<Page title="Практика" sub="Тренировка разговора с клиентом: цена, правки, сроки и договорённости."><ClientSimulator/></Page>}

     {tab==="coach"&&<Page title="Помощник KIVRONIX" sub="Спроси про монтаж обычными словами. Получишь короткий ответ, понятные шаги и способ проверить результат.">
       <AiCoach
         scopeKey="main"
         title="Помощник KIVRONIX"
         prompts={["Я впервые открыл CapCut. С чего начать?","Помоги сделать ролик за 30 минут","Как сделать ролик интереснее?","Объясни мой следующий урок"]}
         context={{
           level:viewer.onboarding?.level||"unknown",
           xp,
           editor:viewer.onboarding?.software||"CapCut",
           goal:viewer.onboarding?.goal||"freelance",
           role:viewer.role,
           plan:activePaidPlan?viewer.plan||"free":"early_access",
           completedLessons:done
         }}
       />
     </Page>}

     {tab==="review"&&<Page title="Разбор видео" sub="Загрузи ролик. KIVRONIX посмотрит отдельные кадры и простыми словами подскажет, что улучшить."><VideoReview/></Page>}
     {tab==="kivronix-challenges"&&<Page title="Конкурсы KIVRONIX" sub="Официальные конкурсы платформы: понятное задание, открытые правила, число мест и честный рейтинг."><KivronixChallenges/></Page>}
     {tab==="arena"&&<Page title="Конкурсы компаний" sub="Настоящие задания, одинаковые материалы и реальные призы."><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="arena"/></Page>}

     {tab==="portfolio"&&<Page title={viewer.role==="editor"?viewer.name:"Примеры работ"} sub="Подтверждённые навыки · настоящие работы · понятная страница">
       <PortfolioPanel/>
       {viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<div style={{marginTop:14}}><GuardianVerification/></div>}
       <div style={{marginTop:14}}>{viewer.username?<Link className="btn btn-dark" href={"/u/"+viewer.username}>Открыть страницу с работами</Link>:<Link className="btn btn-dark" href="/u/demo">Посмотреть пример</Link>}</div>
     </Page>}

     {tab==="wallet"&&<Page title="Мои итоги" sub="Прогресс, KIVRONIX Points и текущий режим доступа.">
       <div className="grid">
         <Card title="Заработано"><div className="wallet-number">{money(viewer.earningsCents||0)}</div><p className="muted">Доход от проектов и заданий после подключения реальных выплат.</p></Card>
         <Card title="KIVRONIX Points"><div className="wallet-number">{Number(viewer.referralPoints||0).toLocaleString("ru-RU")} KP</div><p className="muted">Приглашай активных друзей и получай внутренние баллы. Каталог наград находится в сообществе.</p><button className="btn btn-dark" onClick={()=>goTab("community")}>Открыть награды</button></Card>
         <Card title="Доступ"><div className="wallet-number">{accessLabel}</div><p className="muted">Оплата выключена. Будущие планы уже можно посмотреть без подключения карты.</p><Link className="btn btn-ghost" href="/pricing">Будущие тарифы</Link></Card>
       </div>
     </Page>}

     {tab==="plans"&&<Page title="Тариф и доступ" sub="Текущий режим, будущие возможности и понятные условия без скрытого подключения.">
       <div className="grid">
         <Card title="Сейчас доступно">
           <div className="wallet-number">{accessLabel}</div>
           <p className="muted">{activePaidPlan&&viewer.planExpiresAt
             ?"Активен до "+new Date(viewer.planExpiresAt).toLocaleDateString("ru-RU")
             :"Во время раннего доступа основные функции открыты бесплатно. Банковская карта не требуется."}</p>
         </Card>
         {viewer.role==="business"
           ?<Card title={futurePlans.studio_plus.name}>
             <div className="wallet-number">{futurePlans.studio_plus.priceRub.toLocaleString("ru-RU")} ₽</div>
             <p className="muted">План для регулярных конкурсов, команды и расширенной работы с кандидатами. Призовой фонд каждого задания оплачивается отдельно и не входит в подписку.</p>
             <Link className="btn btn-dark" href="/pricing">Посмотреть будущий Studio+</Link>
           </Card>
           :<Card title={futurePlans.creator_plus.name}>
             <div className="wallet-number">{futurePlans.creator_plus.priceRub.toLocaleString("ru-RU")} ₽</div>
             <p className="muted">Будущий план с расширенными разборами и аналитикой. Его можно будет получить на 30 дней за {futurePlans.creator_plus.pointsPrice} KIVRONIX Points.</p>
             <div className="lesson-actions"><button className="btn btn-dark" onClick={()=>goTab("community")}>Баллы и награды</button><Link className="btn btn-ghost" href="/pricing">Все условия</Link></div>
           </Card>}
         <Card title="Оплата под контролем">
           <p className="muted">Списания выключены. Когда платные планы будут готовы, стоимость и срок появятся до оплаты, а подключение потребует отдельного подтверждения.</p>
           <Link className="btn btn-ghost" href="/pricing">Сравнить возможности</Link>
         </Card>
       </div>
     </Page>}

     {tab==="profile"&&<Page title="Профиль" sub="Навыки, персональный маршрут и публичная карьерная карточка.">
       <div className="profile-grid">
         <ProfileEditor onSaved={profile=>setViewer(current=>({...current,name:profile.displayName,username:profile.username,avatarUrl:profile.avatarUrl,schoolName:profile.schoolName}))}/>
         <Card title="Карточка монтажёра"><p><b>{viewer.name}</b></p><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"свои проекты"} · {accessLabel}{viewer.schoolName?" · "+viewer.schoolName:""}</p>{viewer.username&&<Link className="btn btn-dark" href={"/u/"+viewer.username}>Публичная страница ↗</Link>}</Card>
         <Card title="Навыки"><Skill label="Основа монтажа" value={Math.min(100,done.filter(s=>["what-is-editing","hook-basics","story-basics","retention-basics","editor-words","clean-cut"].includes(s)).length*16)}/><Skill label="Удержание зрителя" value={Math.min(100,done.filter(s=>["hook-basics","retention-basics","hook-2-seconds","subtitles","b-roll","sound"].includes(s)).length*16)}/><Skill label="Работа с клиентом" value={Math.min(100,done.filter(s=>["client-brief","pricing","portfolio"].includes(s)).length*33)}/></Card>
         <Card title="Настройки обучения"><p className="muted">Уровень: {viewer.onboarding?.level||"пока пусто"}<br/>Программа: {viewer.onboarding?.software||"пока пусто"}<br/>Цель: {viewer.onboarding?.goal||"пока пусто"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить настройки</Link></Card><EditorVerification/>{viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<GuardianVerification/>}
       </div>
     </Page>}

     {tab==="jobs"&&<Page title="Работа" sub="Задания и вакансии проверенных компаний собраны в одном месте."><div className="business-stack"><CampaignHub mode="editor"/><JobBoard mode="editor" ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified}/></div></Page>}
     {tab==="messages"&&<Page title="Закрытые чаты" sub="Безопасное общение компании и монтажёра прямо внутри KIVRONIX."><PrivateChats/></Page>}
     {tab==="community"&&<Page title="Сообщество" sub="Рейтинг, друзья, учебные группы, соревнования и приглашения с защитой личных данных."><SocialHub ageGroup={viewer.onboarding?.ageGroup}/></Page>}
     {tab==="business"&&<Page title="Кабинет компании" sub="Сначала подтвердите компанию. После проверки можно публиковать настоящие задания и вакансии."><div className="business-grid"><Stat n={String(businessStats.challenges)} t="активных конкурсов"/><Stat n={String(businessStats.submissions)} t="получено работ"/><Stat n={String(businessStats.jobs)} t="открытых вакансий"/><Stat n={accessLabel} t="режим доступа"/></div><div className="business-stack"><BusinessVerification/><BusinessGrowth/><CampaignHub mode="business"/><BrandBrain viewerName={viewer.name}/><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="business"/><JobBoard mode="business" viewerName={viewer.name}/><Card title="Будущий план Studio+"><p className="muted">Командный кабинет и расширенные инструменты готовятся отдельно от тарифа монтажёра. Оплата выключена.</p><Link className="btn btn-ghost" href="/pricing">Посмотреть план</Link></Card></div></Page>}
   </section>

   <SiteTour role={viewer.role} onGo={(value)=>goTab(value as Tab)}/>
   <nav className="mobile-nav">{tabs.map(([id,l])=><button key={id} className={tab===id?"active":""} onClick={()=>goTab(id)}>{l}</button>)}</nav>
 </main>
}

function Page({title,sub,children}:{title:string;sub:string;children:React.ReactNode}){return <div className="page"><h1>{title}</h1><p className="sub">{sub}</p>{children}</div>}
function Card({title,children}:{title:string;children:React.ReactNode}){return <div className="card"><h3>{title}</h3>{children}</div>}
function Stat({n,t}:{n:string;t:string}){return <div className="stat"><strong>{n}</strong><span className="muted">{t}</span></div>}
function Job({title,pay}:{title:string;pay:string}){return <div className="card job"><small>УДАЛЁННО</small><h3>{title}</h3><p className="muted">Проверенный бизнес · подбор по портфолио и навыкам</p><b>{pay}</b><button className="btn btn-dark">Податься</button></div>}

function Skill({label,value}:{label:string;value:number}){return <div className="skill-row"><div><span>{label}</span><b>{value}</b></div><div className="score-track"><span style={{width:value+"%"}}/></div></div>}
function money(cents:number){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(cents/100)}
