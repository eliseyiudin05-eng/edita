"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type State = {
  role: "editor" | "business";
  level: string;
  software: string;
  goal: string;
};

const defaults: State = {
  role: "editor",
  level: "new",
  software: "CapCut",
  goal: "freelance",
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>(defaults);
  const progress = useMemo(() => ((step + 1) / 4) * 100, [step]);

  function finish() {
    localStorage.setItem("edita_onboarding", JSON.stringify(state));
    window.location.href = "/signup";
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <Link href="/" className="brand">EDITA<span>.</span></Link>
        <div className="onboarding-progress"><span style={{ width: progress + "%" }} /></div>

        {step === 0 && <>
          <div className="eyebrow">ШАГ 1 ИЗ 4</div>
          <h1>Кто ты в EDITA?</h1>
          <Choice active={state.role === "editor"} title="Монтажёр"
            text="Хочу учиться, собирать портфолио и находить заказы."
            onClick={() => setState({ ...state, role: "editor" })} />
          <Choice active={state.role === "business"} title="Бизнес"
            text="Хочу запускать ТЗ, смотреть реальные работы и нанимать."
            onClick={() => setState({ ...state, role: "business" })} />
        </>}

        {step === 1 && <>
          <div className="eyebrow">ШАГ 2 ИЗ 4</div>
          <h1>Твой уровень</h1>
          {[
            ["new","С нуля","Никогда серьёзно не монтировал."],
            ["beginner","Начинающий","Умею резать, добавлять музыку и субтитры."],
            ["intermediate","Уверенный","Есть портфолио или первые клиенты."],
            ["pro","Pro","Работаю регулярно и хочу расти в цене/качестве."],
          ].map(([v,t,d]) => <Choice key={v} active={state.level === v} title={t} text={d} onClick={() => setState({ ...state, level: v })} />)}
        </>}

        {step === 2 && <>
          <div className="eyebrow">ШАГ 3 ИЗ 4</div>
          <h1>Где монтируешь?</h1>
          <div className="choice-grid">
            {["CapCut","Premiere Pro","DaVinci Resolve","Final Cut"].map((v) =>
              <button key={v} className={"choice compact " + (state.software === v ? "active" : "")}
                onClick={() => setState({ ...state, software: v })}>{v}</button>
            )}
          </div>
        </>}

        {step === 3 && <>
          <div className="eyebrow">ШАГ 4 ИЗ 4</div>
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
          {step < 3
            ? <button className="btn btn-dark" onClick={() => setStep((s) => s + 1)}>Дальше</button>
            : <button className="btn btn-lime" onClick={finish}>Создать маршрут</button>}
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
