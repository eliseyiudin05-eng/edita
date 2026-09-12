"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type State={
  level:string;
  software:string;
  goal:string;
};

const defaults:State={level:"new",software:"CapCut",goal:"freelance"};

export default function OnboardingPage(){
  const [step,setStep]=useState(0);
  const [state,setState]=useState<State>(defaults);
  const [saving,setSaving]=useState(false);
  const [role,setRole]=useState<string|null>(null);
  const progress=useMemo(()=>((step+1)/3)*100,[step]);

  useEffect(()=>{
    let active=true;
    const supabase=getSupabaseBrowserClient();
    supabase.auth.getUser().then(async({data})=>{
      if(!active)return;
      if(!data.user){setRole("guest");return;}
      const {data:profile}=await supabase.from("profiles").select("role,onboarding").eq("id",data.user.id).maybeSingle();
      if(!active||!profile)return;
      setRole(profile.role);
      setState({
        level:profile.onboarding?.level||"new",
        software:profile.onboarding?.software||"CapCut",
        goal:profile.onboarding?.goal||"freelance"
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
    const {error}=await supabase.rpc("update_learning_preferences",{
      p_level:state.level,
      p_software:state.software,
      p_goal:state.goal
    });
    setSaving(false);
    if(!error){
      localStorage.setItem("edita_onboarding",JSON.stringify(state));
      window.location.href="/platform";
    }
  }

  if(role==="business"){
    return <main className="onboarding-page"><section className="onboarding-card">
      <Link href="/" className="brand">EDITA<span>.</span></Link>
      <div className="eyebrow">БИЗНЕС-АККАУНТ</div>
      <h1>Здесь нет настроек обучения</h1>
      <p className="muted">У бизнеса свой путь: профиль бренда, проверка компании, задания и вакансии.</p>
      <Link className="btn btn-dark" href="/platform">Вернуться в кабинет бизнеса</Link>
    </section></main>
  }

  return <main className="onboarding-page"><section className="onboarding-card">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="onboarding-progress"><span style={{width:progress+"%"}}/></div>

    {step===0&&<>
      <div className="eyebrow">ШАГ 1 ИЗ 3</div>
      <h1>Как ты сейчас монтируешь?</h1>
      {[
        ["new","С нуля","Только начинаю и хочу, чтобы всё объясняли просто."],
        ["beginner","Начинающий","Умею нарезать видео, добавлять музыку и текст."],
        ["intermediate","Уверенный","Уже есть свои работы или первые клиенты."],
        ["pro","Работаю регулярно","Хочу улучшать качество и брать более сильные проекты."]
      ].map(([v,t,d])=><Choice key={v} active={state.level===v} title={t} text={d} onClick={()=>setState({...state,level:v})}/>)}
    </>}

    {step===1&&<>
      <div className="eyebrow">ШАГ 2 ИЗ 3</div>
      <h1>В какой программе работаешь?</h1>
      <div className="choice-grid">
        {["CapCut","Premiere Pro","DaVinci Resolve","Final Cut"].map(v=><button key={v} className={"choice compact "+(state.software===v?"active":"")} onClick={()=>setState({...state,software:v})}>{v}</button>)}
      </div>
    </>}

    {step===2&&<>
      <div className="eyebrow">ШАГ 3 ИЗ 3</div>
      <h1>Чего хочешь добиться?</h1>
      {[
        ["freelance","Найти первые заказы","Собрать портфолио и уверенно общаться с клиентом."],
        ["reels","Короткие видео","Научиться делать Reels, TikTok и Shorts."],
        ["youtube","YouTube","Разобраться в длинных видео и удержании зрителя."],
        ["career","Стать сильнее","Расти как коммерческий монтажёр."]
      ].map(([v,t,d])=><Choice key={v} active={state.goal===v} title={t} text={d} onClick={()=>setState({...state,goal:v})}/>)}
    </>}

    <div className="onboarding-actions">
      {step>0?<button className="btn btn-ghost" onClick={()=>setStep(s=>s-1)}>Назад</button>:<span/>}
      {step<2
        ?<button className="btn btn-dark" onClick={()=>setStep(s=>s+1)}>Дальше</button>
        :<button className="btn btn-lime" onClick={finish} disabled={saving}>{saving?"Сохраняем…":"Сохранить настройки"}</button>}
    </div>
  </section></main>
}

function Choice({active,title,text,onClick}:{active:boolean;title:string;text:string;onClick:()=>void}){
  return <button className={"choice "+(active?"active":"")} onClick={onClick}><b>{title}</b><span>{text}</span></button>
}
