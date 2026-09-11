"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type State = {
  role: "editor" | "business";
  level: string;
  software: string;
  goal: string;
  ageGroup: "under14" | "14-17" | "18+";
};

const defaults: State = {
  role: "editor",
  level: "new",
  software: "CapCut",
  goal: "freelance",
  ageGroup: "18+",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>(defaults);
  const progress = useMemo(() => ((step + 1) / 5) * 100, [step]);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    let active=true;
    try{
      const raw=localStorage.getItem("edita_onboarding");
      if(raw){
        const saved=JSON.parse(raw);
        setState(v=>({...v,...saved}));
      }
    }catch{}

    const supabase=getSupabaseBrowserClient();
    supabase.auth.getUser().then(async({data})=>{
      if(!active||!data.user)return;
      const {data:profile}=await supabase.from("profiles")
        .select("role,onboarding")
        .eq("id",data.user.id)
        .maybeSingle();
      if(!active||!profile)return;
      setState(v=>({
        ...v,
        ...(profile.onboarding||{}),
        role:profile.role==="business"?"business":"editor"
      }));
    });
    return()=>{active=false};
  },[]);

  async function finish() {
    localStorage.setItem("edita_onboarding", JSON.stringify(state));
    setSaving(true);
    const supabase=getSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();

    if(user){
      const {error}=await supabase.from("profiles")
        .update({role:state.role,onboarding:state})
        .eq("id",user.id);
      setSaving(false);
      if(!error){
        window.location.href="/platform";
        return;
      }
    }

    setSaving(false);
    window.location.href = "/signup";
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <Link href="/" className="brand">EDITA<span>.</span></Link>
        <div className="onboarding-progress"><span style={{ width: progress + "%" }} /></div>

        {step === 0 && <>
          <div className="eyebrow">ШАГ 1 ИЗ 5</div>
          <h1>Кто ты в EDITA?</h1>
          <Choice active={state.role === "editor"} title="Монтажёр"
            text="Хочу учиться, собирать портфолио и находить заказы."
            onClick={() => setState({ ...state, role: "editor" })} />
          <Choice active={state.role === "business"} title="Бизнес"
            text="Хочу запускать ТЗ, смотреть реальные работы и нанимать."
            onClick={() => setState({ ...state, role: "business" })} />
        </>}

        {step === 1 && <>
          <div className="eyebrow">ШАГ 2 ИЗ 5</div>
          <h1>Твой уровень</h1>
          {[
            ["new","С нуля","Никогда серьёзно не монтировал."],
            ["beginner","Начинающий","Умею резать, добавлять музыку и субтитры."],
            ["intermediate","Уверенный","Есть портфолио или первые клиенты."],
            ["pro","Pro","Работаю регулярно и хочу расти в цене/качестве."],
          ].map(([v,t,d]) => <Choice key={v} active={state.level === v} title={t} text={d} onClick={() => setState({ ...state, level: v })} />)}
        </>}

        {step === 2 && <>
          <div className="eyebrow">ШАГ 3 ИЗ 5</div>
          <h1>Где монтируешь?</h1>
          <div className="choice-grid">
            {["CapCut","Premiere Pro","DaVinci Resolve","Final Cut"].map((v) =>
              <button key={v} className={"choice compact " + (state.software === v ? "active" : "")}
                onClick={() => setState({ ...state, software: v })}>{v}</button>
            )}
          </div>
        </>}

        {step === 3 && <>
          <div className="eyebrow">ШАГ 4 ИЗ 5</div>
          <h1>Возрастная группа</h1>
          <p className="muted">Это нужно для безопасного доступа к коммерческим заданиям и коммуникации.</p>
          {[
            ["under14","До 14 лет","Только безопасное обучение и training-режим до отдельного согласия законного представителя."],
            ["14-17","14–17 лет","Обучение доступно; коммерческие функции требуют дополнительной проверки/согласия."],
            ["18+","18+","Полный функционал после обычной верификации аккаунта."]
          ].map(([v,t,d]) => <Choice key={v} active={state.ageGroup === v} title={t} text={d} onClick={() => setState({ ...state, ageGroup: v as State["ageGroup"] })} />)}
        </>}

        {step === 4 && <>
          <div className="eyebrow">ШАГ 5 ИЗ 5</div>
          <h1>Главная цель</h1>
          {[
            ["reels","Short-form","Научиться делать сильные Reels / TikTok / Shorts."],
            ["youtube","YouTube","Монтаж длинных видео и удержание зрителя."],
            ["freelance","Фриланс","Собрать портфолио и найти первых/следующих клиентов."],
            ["career","Карьера","Стать сильным коммерческим монтажёром."],
          ].map(([v,t,d]) => <Choice key={v} active={state.goal === v} title={t} text={d} onClick={() => setState({ ...state, goal: v })} />)}
        </>}

        <div className="onboarding-actions">
          {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>Назад</button> : <span />}
          {step < 4
            ? <button className="btn btn-dark" onClick={() => setStep((s) => s + 1)}>Дальше</button>
            : <button className="btn btn-lime" onClick={finish} disabled={saving}>{saving?"Сохраняем…":"Создать маршрут"}</button>}
        </div>
      </section>
    </main>
  );
}

function Choice({active,title,text,onClick}:{active:boolean;title:string;text:string;onClick:()=>void}) {
  return <button className={"choice " + (active ? "active" : "")} onClick={onClick}>
    <b>{title}</b><span>{text}</span>
  </button>
}
