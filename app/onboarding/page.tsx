"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {extractVideoFrames} from "@/lib/video-frames";
import {normalizeAcademyEditor,normalizeOperatingSystem} from "@/lib/academy-teaching";

type State={
  level:string;
  software:string;
  operatingSystem:string;
  goal:string;
};

const defaults:State={level:"new",software:"CapCut Desktop",operatingSystem:"Windows",goal:"freelance"};

export default function OnboardingPage(){
  const [step,setStep]=useState(0);
  const [state,setState]=useState<State>(defaults);
  const [saving,setSaving]=useState(false);
  const [role,setRole]=useState<string|null>(null);
  const [assessment,setAssessment]=useState<{level:string;label:string;score:number;summary:string}|null>(null);
  const [assessing,setAssessing]=useState(false);
  const [assessmentError,setAssessmentError]=useState("");
  const progress=useMemo(()=>((step+1)/4)*100,[step]);

  useEffect(()=>{
    let active=true;
    const supabase=getSupabaseBrowserClient();
    supabase.auth.getUser().then(async({data})=>{
      if(!active)return;
      if(!data.user){setRole("guest");return;}
      const {data:{session}}=await supabase.auth.getSession();
      const response=await fetch("/api/profile/learning-preferences",{
        headers:session?.access_token?{Authorization:"Bearer "+session.access_token}:{},
        cache:"no-store",
      });
      if(!active||!response.ok)return;
      const profile=await response.json();
      if(!active)return;
      setRole(profile.role);
      const selectedEditor=normalizeAcademyEditor(profile.preferences?.software);
      setState({
        level:profile.preferences?.level||"new",
        software:selectedEditor,
        operatingSystem:normalizeOperatingSystem(profile.preferences?.operatingSystem,selectedEditor),
        goal:profile.preferences?.goal||"freelance"
      });
    });
    return()=>{active=false};
  },[]);

  async function finish(){
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){window.location.href="/signup/editor";return;}
    if(role==="business"){window.location.href="/platform";return;}

    setSaving(true);
    const {data:{session}}=await supabase.auth.getSession();
    const r=await fetch("/api/profile/learning-preferences",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})
      },
      body:JSON.stringify(state)
    });
    setSaving(false);
    if(r.ok){
      localStorage.setItem("kivronix_onboarding",JSON.stringify(state));
      window.location.href="/platform";
    }
  }

  async function assessLevel(file:File){
    setAssessing(true);setAssessmentError("");setAssessment(null);
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)throw new Error("Войди в аккаунт, чтобы пройти оценку.");
      const video=await extractVideoFrames(file,8);
      const response=await fetch("/api/ai/video-review",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({...video,brief:"Входная диагностика монтажёра. Оцени текущий уровень работы по композиции, темпу, титрам и визуальной логике. Назови сильные стороны и навыки, которым нужно уделить больше внимания. Обязательный маршрут всё равно начинается с фундамента."})});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Не удалось оценить видео.");
      const score=Number(data.review?.overall_score||0);
      const level=score>=85?"pro":score>=70?"intermediate":score>=50?"beginner":"new";
      const label={new:"С нуля",beginner:"Начинающий",intermediate:"Уверенный",pro:"Работаю регулярно"}[level];
      setAssessment({level,label,score,summary:String(data.review?.summary||"")});
    }catch(error){setAssessmentError(error instanceof Error?error.message:"Не удалось оценить видео.")}
    finally{setAssessing(false)}
  }

  if(role==="business"){
    return <main className="onboarding-page"><section className="onboarding-card">
      <Link href="/" className="brand">KIVRONIX<span>.</span></Link>
      <div className="eyebrow">БИЗНЕС-АККАУНТ</div>
      <h1>Здесь нет настроек обучения</h1>
      <p className="muted">У бизнеса свой путь: профиль бренда, проверка компании, задания и вакансии.</p>
      <Link className="btn btn-dark" href="/platform">Вернуться в кабинет бизнеса</Link>
    </section></main>
  }

  return <main className="onboarding-page"><section className="onboarding-card">
    <Link href="/" className="brand">KIVRONIX<span>.</span></Link>
    <div className="onboarding-progress"><span style={{width:progress+"%"}}/></div>

    {step===0&&<>
      <div className="eyebrow">ШАГ 1 ИЗ 4</div>
      <h1>Как ты сейчас монтируешь?</h1>
      {[
        ["new","С нуля","Только начинаю и хочу, чтобы всё объясняли просто."],
        ["beginner","Начинающий","Умею нарезать видео, добавлять музыку и текст."],
        ["intermediate","Уверенный","Уже есть свои работы или первые клиенты."],
        ["pro","Работаю регулярно","Хочу улучшать качество и брать более сильные проекты."]
      ].map(([v,t,d])=><Choice key={v} active={state.level===v} title={t} text={d} onClick={()=>setState({...state,level:v})}/>)}
      {state.level==="pro"?<div className="ai-level-check"><div><b>Проверь текущий уровень по своей работе</b><p>ИИ посмотрит ключевые кадры и подскажет, чему уделить больше внимания. Последовательность «НАЧАЛО → БАЗА → PRO» сохраняется, чтобы не осталось пробелов.</p></div><label className="styled-file-control"><span>{assessing?"ИИ анализирует ролик…":"Выбрать видео для оценки"}</span><small>MP4, MOV или WebM</small><input type="file" accept="video/*" disabled={assessing} onChange={event=>{const file=event.target.files?.[0];if(file)void assessLevel(file)}}/></label>{assessment?<div className="ai-level-result"><strong>{assessment.score}/100 · {assessment.label}</strong><p>{assessment.summary}</p><button type="button" className="btn btn-lime" onClick={()=>setState({...state,level:assessment.level})}>Сохранить диагностированный уровень</button></div>:null}{assessmentError?<small className="auth-msg">{assessmentError}</small>:null}</div>:null}
    </>}

    {step===1&&<>
      <div className="eyebrow">ШАГ 2 ИЗ 4</div>
      <h1>В какой программе работаешь?</h1>
      <div className="choice-grid">
        {["CapCut Desktop","Adobe Premiere Pro","DaVinci Resolve","Final Cut Pro"].map(v=><button key={v} className={"choice compact "+(state.software===v?"active":"")} onClick={()=>setState({...state,software:v,operatingSystem:v==="Final Cut Pro"?"macOS":state.operatingSystem})}>{v}</button>)}
      </div>
    </>}

    {step===2&&<>
      <div className="eyebrow">ШАГ 3 ИЗ 4</div>
      <h1>На какой системе монтируешь?</h1>
      <div className="choice-grid">
        {["Windows","macOS"].map(v=><button key={v} disabled={state.software==="Final Cut Pro"&&v==="Windows"} className={"choice compact "+(state.operatingSystem===v?"active":"")} onClick={()=>setState({...state,operatingSystem:v})}>{v}{state.software==="Final Cut Pro"&&v==="Windows"?" · недоступно для Final Cut":""}</button>)}
      </div>
      <p className="muted">Покажем сочетания клавиш и пути по меню именно для твоей системы.</p>
    </>}

    {step===3&&<>
      <div className="eyebrow">ШАГ 4 ИЗ 4</div>
      <h1>Чего хочешь добиться?</h1>
      {[
        ["freelance","Найти первые заказы","Собрать страницу со своими работами и уверенно общаться с клиентом."],
        ["reels","Короткие видео","Научиться делать вертикальные ролики для социальных сетей."],
        ["commercial","Видео для брендов","Делать понятные экспертные и рекламные короткие ролики."],
        ["career","Стать сильнее","Расти как коммерческий монтажёр."]
      ].map(([v,t,d])=><Choice key={v} active={state.goal===v} title={t} text={d} onClick={()=>setState({...state,goal:v})}/>)}
    </>}

    <div className="onboarding-actions">
      {step>0?<button className="btn btn-ghost" onClick={()=>setStep(s=>s-1)}>Назад</button>:<span/>}
      {step<3
        ?<button className="btn btn-dark" onClick={()=>setStep(s=>s+1)}>Дальше</button>
        :<button className="btn btn-lime" onClick={finish} disabled={saving}>{saving?"Сохраняем…":"Сохранить настройки"}</button>}
    </div>
  </section></main>
}

function Choice({active,title,text,onClick}:{active:boolean;title:string;text:string;onClick:()=>void}){
  return <button className={"choice "+(active?"active":"")} onClick={onClick}><b>{title}</b><span>{text}</span></button>
}
