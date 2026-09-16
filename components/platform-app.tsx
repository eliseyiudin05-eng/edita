"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getFreshAccessToken,getSupabaseBrowserClient} from "@/lib/supabase-browser";
import ChallengeCenter from "@/components/challenge-center";
import VideoReview from "@/components/video-review";
import {curriculum,curriculumModules,curriculumStats,learningStartIndex,learningStarts,lessonAccess,nextAvailableLesson,normalizeExperienceLevel} from "@/lib/curriculum";
import AiCoach from "@/components/ai-coach";
import BrandBrain from "@/components/brand-brain";
import ClientSimulator from "@/components/client-simulator";
import KivronixVideo from "@/components/kivronix-video";
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
import PayoutPanel from "@/components/payout-panel";
import EditingInsights from "@/components/editing-insights";
import BusinessDashboard from "@/components/business-dashboard";
import BusinessInsights from "@/components/business-insights";
import CreatorVerification from "@/components/creator-verification";
import MotivationCoach from "@/components/motivation-coach";
import AcademyAssessment from "@/components/academy-assessment";
import EditorDirectory from "@/components/editor-directory";
import CreatorStudio from "@/components/creator-studio";
import PartnerDirectory from "@/components/partner-directory";
import EditorProgressDashboard from "@/components/editor-progress-dashboard";
import PlatformReviewForm from "@/components/platform-review-form";

type Tab="home"|"academy"|"insights"|"practice"|"coach"|"review"|"kivronix-challenges"|"arena"|"portfolio"|"talent"|"partners"|"jobs"|"messages"|"community"|"wallet"|"plans"|"profile"|"business";
type Onboarding={level?:string;software?:string;goal?:string;ageGroup?:string;accountKind?:string;socialUrl?:string};
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
  ["home","Главная"],["academy","Обучение"],["insights","Лайфхаки"],["practice","Практика"],["coach","Помощник"],["review","Разбор видео"],
  ["kivronix-challenges","Конкурсы KIVRONIX"],["arena","Конкурсы компаний"],["portfolio","KIVRONIX Video"],["talent","Монтажёры"],["partners","Блогеры и компании"],["jobs","Работа"],["messages","Закрытые чаты"],["community","Сообщество"],["wallet","Мои итоги"],["plans","Тариф и доступ"],["profile","Профиль"],["business","Компания"]
];

export default function PlatformApp(){
 const [tab,setTab]=useState<Tab>("home");
 const [done,setDone]=useState<string[]>([]);
 const [viewer,setViewer]=useState<Viewer>({name:"Гость",role:null,onboarding:{}});
 const [wins,setWins]=useState(0);
 const [businessStats,setBusinessStats]=useState({challenges:0,submissions:0,jobs:0});
 const [passedAssessments,setPassedAssessments]=useState<number[]>([]);

 const xp=useMemo(()=>done.reduce((sum,slug)=>sum+(curriculum.find(l=>l.slug===slug)?.xp||0),0),[done]);
 const experienceLevel=normalizeExperienceLevel(viewer.onboarding?.level);
 const isCreator=viewer.role==="business"&&viewer.onboarding?.accountKind==="creator";
 const suggestedStart=learningStarts[experienceLevel];
 const suggestedStartIndex=learningStartIndex(experienceLevel);
 const suggestedModuleIndex=Math.max(0,curriculumModules.findIndex(group=>group.lessons.some(lesson=>lesson.slug===suggestedStart.slug)));
 const currentLesson=nextAvailableLesson(done,passedAssessments,experienceLevel);
 const tabs=useMemo(()=>{
   if(isCreator) return allTabs.filter(([id])=>["home","portfolio","talent","jobs","messages","profile"].includes(id)).map(([id,label])=>[id,id==="home"?"Студия блогера":id==="talent"?"Найти монтажёра":id==="jobs"?"Мои задания":id==="messages"?"Чаты с монтажёрами":id==="profile"?"Проверка аккаунта":label] as [Tab,string]);
   if(viewer.role==="business") return allTabs.filter(([id])=>["home","insights","coach","review","arena","portfolio","talent","messages","plans","profile","business"].includes(id)).map(([id,label])=>[id,id==="home"?"Обзор":id==="talent"?"Каталог монтажёров":id==="coach"?"Бизнес-помощник":id==="review"?"Анализ роликов":id==="arena"?"Лига компаний":id==="profile"?"Профиль компании":label] as [Tab,string]);
   if(viewer.role==="editor") return allTabs.filter(([id])=>id!=="business"&&id!=="talent");
   return allTabs;
 },[viewer.role,isCreator]);

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
     const assessmentRaw=localStorage.getItem("kivronix_academy_assessments");
     if(assessmentRaw)setPassedAssessments(JSON.parse(assessmentRaw));
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

     const accessToken=await getFreshAccessToken();
     let dbDone:string[]=[];
     if(accessToken){
       try{
         const [progressResponse,assessmentResponse]=await Promise.all([
           fetch("/api/lessons/progress",{headers:{Authorization:"Bearer "+accessToken},cache:"no-store"}),
           fetch("/api/academy/assessments",{headers:{Authorization:"Bearer "+accessToken},cache:"no-store"})
         ]);
         if(progressResponse.ok){const progress=await progressResponse.json();
           if(Array.isArray(progress?.completedSlugs))dbDone=progress.completedSlugs.filter((slug:unknown):slug is string=>typeof slug==="string");
         }
         if(assessmentResponse.ok){const assessment=await assessmentResponse.json();if(Array.isArray(assessment.passed))setPassedAssessments(assessment.passed)}
       }catch{}
     }
     if(!active)return;
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
       if(!window.location.hash)setTab("home");
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
   window.location.assign("/login");
 }

 async function passAssessment(moduleIndex:number,result:{score:number;quizScore:number}){
   const accessToken=await getFreshAccessToken();
   if(!accessToken)throw new Error("Войди в аккаунт, чтобы сохранить аттестацию.");
   const response=await fetch("/api/academy/assessments",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({moduleIndex,moduleName:curriculumModules[moduleIndex]?.module,final:moduleIndex===curriculumModules.length-1,...result})});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||"Не удалось сохранить аттестацию.");
   setPassedAssessments(current=>{
     const next=current.includes(moduleIndex)?current:[...current,moduleIndex];
     try{localStorage.setItem("kivronix_academy_assessments",JSON.stringify(next))}catch{}
     return next;
   });
 }

 const roleLabel=isCreator?"Заказчик":viewer.role==="business"?"Бизнес":viewer.role==="editor"?"Монтажёр":"Гость";
 const activePaidPlan=Boolean(viewer.plan&&viewer.plan!=="free"&&viewer.planExpiresAt&&new Date(viewer.planExpiresAt).getTime()>Date.now());
 const accessLabel:string=activePaidPlan?(viewer.plan==="creator_plus"?"Creator+":viewer.plan==="studio_plus"?"Studio+":viewer.plan||"платный план"):"бесплатно";

 return <main className="app">
   <aside className="side">
     <Link className="brand app-brand" href="/platform#home"><span>KIVRONIX<b>.</b></span><small>{isCreator?"монтажёр для твоих роликов":viewer.role==="business"?"рост видео-команды":"твой путь в монтаже"}</small></Link>
     <nav className="nav">{tabs.map(([id,l])=><button className={tab===id?"active":""} onClick={()=>goTab(id)} key={id}>{l}</button>)}</nav>
     <div className="profile">
       <div className="side-profile-head"><ProfileAvatar src={viewer.avatarUrl} name={viewer.name} size="sm"/><b>{viewer.name}</b></div>
       {roleLabel}{viewer.role?" · "+accessLabel:""}<br/>
       {viewer.role==="editor"&&<>{xp} опыта<br/></>}
       {viewer.username&&<><Link href={"/u/"+viewer.username}>Страница с работами ↗</Link><br/></>}
       {viewer.role
         ? <button className="btn" onClick={signOut} style={{marginTop:10}}>Выйти</button>
         : <Link className="btn btn-lime" href="/signup" style={{marginTop:10}}>Начать</Link>}
     </div>
   </aside>

   <section className="main">
     <header className="head">
       <button type="button" className="app-back-button" onClick={()=>tab==="home"?window.history.back():goTab("home")}>← Назад</button>
       <b className="mobile">KIVRONIX.</b>
       <div className="user-pill"><ProfileAvatar src={viewer.avatarUrl} name={viewer.name} size="sm"/><span>{viewer.role?"в сети":"пример"} · {accessLabel}{viewer.role==="editor"?" · "+xp+" опыта":""}</span></div>
     </header>
     {viewer.role==="editor"?<MotivationCoach xp={xp} compact/>:null}

     {tab==="home"&&viewer.role==="business"&&!isCreator&&<Page title={"Добро пожаловать, "+viewer.name+"."} sub="Управляйте поиском монтажёров и результатами коротких видео из одного кабинета.">
       <BusinessDashboard stats={businessStats} points={viewer.referralPoints||0} onGo={goTab}/>
     </Page>}

     {tab==="home"&&isCreator&&<Page title={"Твои ролики, "+viewer.name+"."} sub="Создавай задания, выбирай монтажёра и следи за выполнением в одном месте.">
       <section className="business-hero-panel"><div><div className="eyebrow">КАБИНЕТ ЗАКАЗЧИКА</div><h2>От идеи ролика до готового монтажа</h2><p>Опиши задачу простыми словами. Подходящие монтажёры откликнутся, а после твоего выбора откроется закрытый чат для работы.</p><div className="lesson-actions"><button className="btn btn-lime" onClick={()=>goTab("jobs")}>Создать задание</button><button className="btn btn-light" onClick={()=>goTab("messages")}>Открыть чаты</button></div></div></section>
       <div className="business-kpi-grid"><article><span>Активные задания</span><strong>{businessStats.jobs}</strong></article><article><span>Новые отклики</span><strong>—</strong><small>появятся после публикации</small></article><article><span>В работе</span><strong>—</strong><small>выбранные монтажёры</small></article><article><span>Готово</span><strong>—</strong><small>история выполненных работ</small></article></div>
       <div className="auth-msg"><b>Как это работает:</b> 1. Подтверди публичную страницу. 2. Создай понятное задание. 3. Выбери монтажёра из откликов. 4. Общайся с ним в закрытом чате до готового результата.</div>
       <CreatorStudio onGo={value=>goTab(value)}/>
     </Page>}

     {tab==="home"&&viewer.role!=="business"&&<Page title={viewer.role?"Продолжай, "+viewer.name+".":"Добро пожаловать в KIVRONIX."} sub={viewer.role?"Открой ближайший урок и двигайся по шагам.":"Посмотри платформу. После входа помощник и учебный прогресс сохраняются."}>
       {viewer.role==="editor"?<EditorProgressDashboard xp={xp} completed={done.length} total={curriculum.length} aiScore={viewer.aiScore}/>:null}
       <section className="mission"><small>ТВОЙ ПУТЬ</small><h2>{done.length?"Продолжи следующий урок":"Первый ролик начинается с одной кнопки"}</h2><p>{curriculum.length} коротких уроков ведут от установки CapCut и первой склейки до цвета, звука, своих работ и общения с заказчиком.</p><button className="btn btn-lime" onClick={()=>goTab("academy")}>Продолжить обучение →</button></section>
       <div className="grid">
         <Card title="Твой рост"><div className="stats"><Stat n={viewer.aiScore!=null?String(viewer.aiScore):"—"} t="оценка ролика"/><Stat n={String(done.length)} t="уроков"/><Stat n={String(wins)} t="побед"/></div></Card>
         <Card title="Конкурс KIVRONIX"><p className="muted">Приз 10 000 бонусных KIVRONIX Points: опубликуй короткий ролик, отметь KIVRONIX и участвуй в честном рейтинге просмотров.</p><button className="btn btn-dark" onClick={()=>goTab("kivronix-challenges")}>Открыть конкурс</button></Card>
         <Card title="Твой путь"><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"свои проекты"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить цель</Link></Card>
       </div>
     </Page>}

     {tab==="academy"&&<Page title="Обучение" sub="Выбери свою стартовую точку и проходи уроки по порядку. Каждый урок объясняет одну тему простыми словами.">
       <div className="academy-start-card"><div><div className="eyebrow">{currentLesson?"СЛЕДУЮЩИЙ ДОСТУПНЫЙ УРОК":"МАРШРУТ ПРОЙДЕН"} · {suggestedStart.label.toUpperCase()}</div><h2>{currentLesson?.title||"Все доступные уроки завершены"}</h2><p>{suggestedStart.reason} Все завершённые уроки можно открыть повторно в любой момент.</p></div>{currentLesson?<Link className="btn btn-lime" href={"/academy/"+currentLesson.slug}>Открыть урок →</Link>:null}</div>
       <div className="academy-overview">
         <Stat n={String(curriculumStats.lessons)} t="уроков"/><Stat n={String(curriculumStats.theory)} t="уроков теории"/><Stat n={String(curriculumStats.assignments)} t="заданий"/><Stat n={String(done.length)} t="пройдено"/>
       </div>
       <div className="academy-route-note"><b>Как здесь учиться?</b><span>Нажми «Начать с этого урока». Закончи его — и откроется следующий. Если что-то непонятно, помощник находится прямо внутри урока.</span></div>
       <div className="academy-modules">{curriculumModules.map((group,moduleIndex)=><section className="academy-module" key={group.module}>
         <header><div><div className="eyebrow">СТУПЕНЬ {moduleIndex+1}</div><h2>{group.module}</h2></div><span>{group.lessons.filter(item=>done.includes(item.slug)).length} / {group.lessons.length}</span></header>
         <div className="academy-lesson-grid">{group.lessons.map(lesson=>{
           const lessonIndex=curriculum.findIndex(item=>item.slug===lesson.slug);
           const access=lessonAccess(lesson.slug,done,passedAssessments,experienceLevel);
           const unlocked=access.unlocked;
           return <article className={"academy-lesson-card "+(done.includes(lesson.slug)?"done ":"")+(unlocked?"":"locked")} key={lesson.slug}>
             <div className="academy-lesson-top"><span className="num">{done.includes(lesson.slug)?"✓":unlocked?lessonIndex+1:"—"}</span><div><small>{lesson.level} · {lesson.minutes} мин</small><b>{unlocked?lesson.software:"Откроется после предыдущего урока"}</b></div></div>
             <h3>{lesson.title}</h3><p>{lesson.summary}</p>
             <div className="academy-tags"><span>{lesson.track}</span><span>{lesson.theoryOnly?"Простое объяснение":"Наглядная схема"}</span>{lesson.clicks?.length?<span>Карта кнопок</span>:null}<span>Помощник в уроке</span></div>
             <div className="lesson-actions">{unlocked?<Link className="btn btn-dark" href={"/academy/"+lesson.slug}>{done.includes(lesson.slug)?"Посмотреть снова":"Открыть урок"}</Link>:<button className="btn btn-ghost" disabled>{access.reason==="assessment"?"Сначала пройди аттестацию":"Сначала заверши доступный урок"}</button>}<span className="lesson-xp">+{lesson.xp} опыта</span></div>
           </article>
         })}</div>
         {group.lessons.every(item=>done.includes(item.slug))&&moduleIndex>=suggestedModuleIndex?<AcademyAssessment moduleIndex={moduleIndex} moduleName={group.module} final={moduleIndex===curriculumModules.length-1} passed={passedAssessments.includes(moduleIndex)} onPassed={result=>passAssessment(moduleIndex,result)}/>:<div className="academy-assessment-preview"><b>{moduleIndex===curriculumModules.length-1?"Финальный экзамен":"Аттестация ступени"}</b><span>{moduleIndex===curriculumModules.length-1?"После уроков: 5 работ, общий тест и ИИ‑оценка от 85 баллов.":"Заверши уроки ступени, добавь 3 работы и пройди мини‑тест. ИИ подскажет, что исправить перед переходом."}</span></div>}
       </section>)}</div>
     </Page>}

     {tab==="insights"&&<Page title={viewer.role==="business"?"Лайфхаки для компаний":"Лайфхаки"} sub={viewer.role==="business"?"Практика сильных брифов, контента и работы с монтажёрами. Обсуждение доступно только компаниям.":"Короткие советы, интересные факты и закрытые обсуждения о монтаже."}>{viewer.role==="business"?<BusinessInsights/>:<EditingInsights/>}</Page>}

     {tab==="practice"&&<Page title="Практика" sub="Тренировка разговора с клиентом: цена, правки, сроки и договорённости."><ClientSimulator/></Page>}

     {tab==="coach"&&<Page title={viewer.role==="business"?"Бизнес-помощник KIVRONIX":"Помощник KIVRONIX"} sub={viewer.role==="business"?"Соберите бриф, сравните кандидатов, разберите метрики и найдите следующую гипотезу роста.":"Спроси про монтаж обычными словами. Получишь короткий ответ, понятные шаги и способ проверить результат."}>
       <div className="ai-learning-note"><b>{viewer.role==="business"?"ИИ работает как часть вашей контент-команды":"ИИ становится полезнее внутри KIVRONIX"}</b><span>{viewer.role==="business"?"Он помогает формулировать брифы, сравнивать идеи и разбирать бизнес-метрики. История компании хранится отдельно от учебных диалогов монтажёров.":"Он учитывает твой уровень, программу, текущий урок, пройденные темы и историю вопросов. Оценки ответов попадают в очередь улучшений, а в общую базу знаний — только после проверки."}</span></div>
       <AiCoach
         scopeKey={viewer.role==="business"?"business-assistant":"main"}
         title={viewer.role==="business"?"Бизнес-помощник KIVRONIX":"Помощник KIVRONIX"}
         welcome={viewer.role==="business"?"Расскажите о продукте, аудитории и цели. Помогу подготовить бриф, выбрать монтажёра или понять, что улучшить в контенте.":undefined}
         prompts={viewer.role==="business"?["Составь бриф для Reels","Как выбрать монтажёра по тестовой работе?","Разбери результаты последних роликов","Придумай конкурс для нашего бренда"]:["Я впервые открыл CapCut. С чего начать?","Помоги сделать ролик за 30 минут","Как сделать ролик интереснее?","Объясни мой следующий урок"]}
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

     {tab==="review"&&<Page title={viewer.role==="business"?"Анализ роликов компании":"Разбор видео"} sub={viewer.role==="business"?"Загрузите Reels, Shorts или TikTok и получите оценку бизнес-задачи, продукта, удержания и призыва к действию.":"Загрузи ролик. KIVRONIX посмотрит отдельные кадры и простыми словами подскажет, что улучшить."}><VideoReview mode={viewer.role==="business"?"business":"editor"}/></Page>}
     {tab==="kivronix-challenges"&&<Page title="Конкурсы KIVRONIX" sub="Официальные конкурсы платформы: понятное задание, открытые правила, число мест и честный рейтинг."><KivronixChallenges/></Page>}
     {tab==="arena"&&<Page title="Конкурсы компаний" sub="Настоящие задания, одинаковые материалы и реальные призы."><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} editorEligible={xp>=300} mode="arena"/></Page>}

     {tab==="portfolio"&&<Page title="KIVRONIX Video" sub="Вертикальная лента работ монтажёров, блогеров и компаний — открыта каждому участнику платформы.">
       <KivronixVideo isCreator={isCreator}/>
       {viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<div style={{marginTop:14}}><GuardianVerification/></div>}
       <div style={{marginTop:14}}>{viewer.username?<Link className="btn btn-dark" href={"/u/"+viewer.username}>Открыть страницу с работами</Link>:<Link className="btn btn-dark" href="/u/demo">Посмотреть пример</Link>}</div>
     </Page>}
     {tab==="talent"&&viewer.role==="business"&&<Page title="Каталог монтажёров" sub="Сравните общий рейтинг, подтверждённый уровень, AI‑оценку и количество работ. Портфолио открывается до начала диалога."><EditorDirectory onOpenMessages={()=>goTab("messages")}/></Page>}
     {tab==="partners"&&viewer.role==="editor"&&<Page title="Блогеры и компании" sub="Каталог потенциальных заказчиков: изучай направления, профили и будущие задачи внутри платформы."><PartnerDirectory/></Page>}

     {tab==="wallet"&&<Page title="Мои итоги" sub="Денежные выигрыши, KIVRONIX Points и текущий режим доступа.">
       <div className="grid">
         <Card title="К выводу"><div className="wallet-number">{money(viewer.earningsCents||0)}</div><p className="muted">Сюда попадают денежные награды от компаний. Официальные конкурсы KIVRONIX начисляют Points на отдельный баланс.</p><PayoutPanel balanceCents={viewer.earningsCents||0}/></Card>
         <Card title="Бонусные KIVRONIX Points"><div className="wallet-number">{Number(viewer.referralPoints||0).toLocaleString("ru-RU")} KP</div><p className="muted">Получай бонусные поинты за полезные действия и приглашения друзей. Их нельзя купить, перевести другому человеку или вывести в деньги.</p><button className="btn btn-dark" onClick={()=>goTab("community")}>Открыть награды</button></Card>
         <Card title="Доступ"><div className="wallet-number">{accessLabel}</div><p className="muted">Основные функции доступны бесплатно, банковская карта не требуется.</p><Link className="btn btn-ghost" href="/pricing">Все возможности</Link></Card>
       </div>
     </Page>}

     {tab==="plans"&&<Page title="Тариф и доступ" sub="Текущий режим, будущие возможности и понятные условия без скрытого подключения.">
       <div className="grid">
         <Card title="Сейчас доступно">
           <div className="wallet-number">{accessLabel}</div>
           <p className="muted">{activePaidPlan&&viewer.planExpiresAt
             ?"Активен до "+new Date(viewer.planExpiresAt).toLocaleDateString("ru-RU")
             :"Основные функции открыты бесплатно. Банковская карта не требуется."}</p>
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

     {tab==="profile"&&viewer.role!=="business"&&<Page title="Профиль" sub="Навыки, персональный маршрут и публичная карьерная карточка.">
       <div className="profile-grid">
         <ProfileEditor onSaved={profile=>setViewer(current=>({...current,name:profile.displayName,username:profile.username,avatarUrl:profile.avatarUrl,schoolName:profile.schoolName}))}/>
         <Card title="Карточка монтажёра"><p><b>{viewer.name}</b></p><p className="muted">{viewer.onboarding?.software||"CapCut"} · {viewer.onboarding?.goal||"свои проекты"} · {accessLabel}{viewer.schoolName?" · "+viewer.schoolName:""}</p>{viewer.username&&<Link className="btn btn-dark" href={"/u/"+viewer.username}>Публичная страница ↗</Link>}</Card>
         <Card title="Навыки"><Skill label="Основа монтажа" value={Math.min(100,done.filter(s=>["what-is-editing","hook-basics","story-basics","retention-basics","editor-words","clean-cut"].includes(s)).length*16)}/><Skill label="Удержание зрителя" value={Math.min(100,done.filter(s=>["hook-basics","retention-basics","hook-2-seconds","subtitles","b-roll","sound"].includes(s)).length*16)}/><Skill label="Работа с клиентом" value={Math.min(100,done.filter(s=>["client-brief","pricing","portfolio"].includes(s)).length*33)}/></Card>
         <Card title="Настройки обучения"><p className="muted">Уровень: {viewer.onboarding?.level||"пока пусто"}<br/>Программа: {viewer.onboarding?.software||"пока пусто"}<br/>Цель: {viewer.onboarding?.goal||"пока пусто"}</p><Link className="btn btn-ghost" href="/onboarding">Изменить настройки</Link></Card><EditorVerification/>{viewer.onboarding?.ageGroup&&viewer.onboarding.ageGroup!=="18+"&&<GuardianVerification/>}
         <AiCoach compact scopeKey="profile:editor" title="Помощник по профилю" welcome="Помогу описать навыки, выбрать сильные работы и оформить профиль без громких обещаний." prompts={["Помоги написать описание профиля","Какие работы добавить первыми?","Как описать мой уровень?"]} context={{role:"editor",editor:viewer.onboarding?.software,goal:viewer.onboarding?.goal}}/>
       </div>
     </Page>}

     {tab==="profile"&&viewer.role==="business"&&!isCreator&&<Page title="Профиль компании" sub="Единая карточка бренда, которую видят помощник и приглашённые монтажёры."><div className="business-stack"><BrandBrain viewerName={viewer.name}/><BusinessVerification/><AiCoach compact scopeKey="profile:business" title="Помощник по профилю бренда" welcome="Расскажи, чем занимается компания. Я помогу понятно описать бренд, аудиторию, стиль и ожидания от видео." prompts={["Помоги описать бренд","Сформулируй нашу аудиторию","Как объяснить визуальный стиль?"]} context={{role:"business",goal:"Оформить профиль "+viewer.name}}/><Card title="Что увидят монтажёры"><p className="muted">Название и подтверждение компании, понятные задания, сроки, награды, история выбора победителей и оценка взаимодействия. Учебные данные монтажёра здесь не используются.</p></Card></div></Page>}

     {tab==="profile"&&isCreator&&<Page title="Профиль блогера" sub="Подтверди публичную страницу и объясни монтажёрам стиль своего контента."><div className="business-stack"><CreatorVerification/><BrandBrain viewerName={viewer.name}/><AiCoach compact scopeKey="profile:creator" title="Помощник по профилю блогера" welcome="Помогу оформить тематику блога, аудиторию, тон и требования к монтажу." prompts={["Опиши мой блог","Собери требования к монтажу","Помоги объяснить мой стиль"]} context={{role:"creator",goal:"Оформить профиль "+viewer.name}}/><Card title="Что увидят монтажёры"><p className="muted">Твоё имя, отметку «Проверенный блогер», описание контента, задачи и сроки. Пароль, электронная почта и личные данные не публикуются.</p></Card></div></Page>}

     {tab==="jobs"&&isCreator&&<Page title="Мои задания и проекты" sub="Опубликуй задачу одному монтажёру или собери команду. После выбора откроются постоянные рабочие чаты."><div className="business-stack"><CampaignHub mode="business"/><JobBoard mode="business" viewerName={viewer.name}/></div></Page>}
     {tab==="jobs"&&!isCreator&&<Page title="Работа" sub="Задания и вакансии проверенных компаний собраны в одном месте."><div className="business-stack"><CampaignHub mode="editor"/><JobBoard mode="editor" ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified}/></div></Page>}
     {tab==="messages"&&<Page title="Закрытые чаты" sub="Личный диалог блогера или компании с монтажёром. Его видят только два участника, а контакты и внешние ссылки блокируются."><PrivateChats/></Page>}
     {tab==="community"&&<Page title="Сообщество" sub="Рейтинг, друзья, учебные группы, соревнования и приглашения с защитой личных данных."><SocialHub ageGroup={viewer.onboarding?.ageGroup}/></Page>}
     {tab==="business"&&<Page title="Кабинет компании" sub="Сначала подтвердите компанию. После проверки можно публиковать настоящие задания и вакансии."><div className="business-grid"><Stat n={String(businessStats.challenges)} t="активных конкурсов"/><Stat n={String(businessStats.submissions)} t="получено работ"/><Stat n={String(businessStats.jobs)} t="открытых вакансий"/><Stat n={accessLabel} t="режим доступа"/></div><div className="business-stack"><BusinessVerification/><BusinessGrowth/><CampaignHub mode="business"/><BrandBrain viewerName={viewer.name}/><ChallengeCenter role={viewer.role} viewerName={viewer.name} ageGroup={viewer.onboarding?.ageGroup} guardianVerified={viewer.guardianVerified} mode="business"/><JobBoard mode="business" viewerName={viewer.name}/><Card title="Будущий план Studio+"><p className="muted">Командный кабинет и расширенные инструменты готовятся отдельно от тарифа монтажёра. Оплата выключена.</p><Link className="btn btn-ghost" href="/pricing">Посмотреть план</Link></Card></div></Page>}
     {viewer.role?<div className="page review-page-slot"><PlatformReviewForm/></div>:null}
   </section>

   <footer className="app-footer"><div><Link className="brand" href="/platform#home">KIVRONIX<span>.</span></Link><p>{isCreator?"Ставь понятные задачи и работай с монтажёром внутри платформы.":viewer.role==="business"?"Находите монтажёров, проверяйте идеи и растите сильную видео-команду.":"Учись, создавай сильные работы и находи реальные проекты."}</p></div><nav><button onClick={()=>goTab("home")}>Главная</button>{isCreator?<button onClick={()=>goTab("jobs")}>Задания</button>:viewer.role!=="business"?<button onClick={()=>goTab("academy")}>Обучение</button>:<button onClick={()=>goTab("arena")}>Лига компаний</button>}{!isCreator&&<button onClick={()=>goTab("insights")}>Лайфхаки</button>}<Link href="/status">Статус сервисов</Link></nav><span>© 2026 KIVRONIX · бесплатно</span></footer>

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
