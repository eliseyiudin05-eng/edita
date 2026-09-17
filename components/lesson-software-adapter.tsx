"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";
import type {Lesson} from "@/lib/curriculum";
import LessonActionVisuals from "@/components/lesson-action-visuals";
import {
  academyEditorOptions,
  editorInstruction,
  lessonTeachingPlan,
  normalizeAcademyEditor,
  normalizeOperatingSystem,
  toolEquivalence,
  type AcademyEditor,
  type OperatingSystem,
} from "@/lib/academy-teaching";

export default function LessonSoftwareAdapter({lesson}:{lesson:Lesson}){
  const [editor,setEditor]=useState<AcademyEditor>("CapCut Desktop");
  const [operatingSystem,setOperatingSystem]=useState<OperatingSystem>("Windows");
  const [showAfter,setShowAfter]=useState(false);
  const plan=useMemo(()=>lessonTeachingPlan(lesson),[lesson]);
  const guide=useMemo(()=>editorInstruction(lesson,editor,operatingSystem),[lesson,editor,operatingSystem]);
  const tools=useMemo(()=>toolEquivalence(lesson),[lesson]);

  useEffect(()=>{
    let active=true;
    try{
      const local=JSON.parse(localStorage.getItem("kivronix_onboarding")||"{}");
      const localEditor=normalizeAcademyEditor(local?.software);
      if(active){setEditor(localEditor);setOperatingSystem(normalizeOperatingSystem(local?.operatingSystem,localEditor))}
    }catch{}
    void(async()=>{
      const token=await getFreshAccessToken();
      if(!token)return;
      const response=await fetch("/api/profile/learning-preferences",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      if(!active||!response.ok)return;
      const data=await response.json();
      const selected=normalizeAcademyEditor(data.preferences?.software);
      if(active){setEditor(selected);setOperatingSystem(current=>normalizeOperatingSystem(data.preferences?.operatingSystem||current,selected))}
    })();
    return()=>{active=false};
  },[]);

  return <section className="editor-lesson-workbench">
    <header className="editor-workbench-head">
      <div><div className="eyebrow">ИНСТРУКЦИЯ ДЛЯ ВЫБРАННОГО РЕДАКТОРА</div><h2>{editor} · {operatingSystem}</h2><p>{guide.common}</p></div>
      <Link className="btn btn-ghost" href="/onboarding">Изменить редактор</Link>
    </header>

    <div className="editor-step-grid">
      {guide.steps.map((step,index)=><article key={step}><span>{index+1}</span><p>{step}</p></article>)}
    </div>

    <LessonActionVisuals
      lesson={lesson}
      editor={editor}
      operatingSystem={operatingSystem}
      action={guide.action}
      steps={guide.steps}
      before={plan.before}
      after={plan.after}
    />

    <div className="editor-workbench-grid">
      <section className="editor-tool-map">
        <div className="eyebrow">ОДИН НАВЫК · ЧЕТЫРЕ ПРОГРАММЫ</div>
        <h3>Как называется инструмент</h3>
        <div className="editor-tool-table-wrap"><table><thead><tr><th>Действие</th>{academyEditorOptions.map(option=><th className={option.value===editor?"selected":""} key={option.value}>{option.label}</th>)}</tr></thead><tbody>{tools.map(row=><tr key={row.goal}><th>{row.goal}</th>{academyEditorOptions.map(option=><td className={option.value===editor?"selected":""} key={option.value}>{row.values[option.value]}</td>)}</tr>)}</tbody></table></div>
        <details className="other-editor-details"><summary>Как сделать в другой программе</summary><div>{academyEditorOptions.filter(option=>option.value!==editor).map(option=>{const otherOs=normalizeOperatingSystem(operatingSystem,option.value);const otherGuide=editorInstruction(lesson,option.value,otherOs);return <article key={option.value}><b>{option.label}</b><ol>{otherGuide.steps.map(step=><li key={step}>{step}</li>)}</ol></article>})}</div></details>
      </section>

      <aside className="lesson-visual-production">
        <div className="eyebrow">СТАТУС МАТЕРИАЛА</div>
        <h3>Что уже готово</h3>
        <ul className="visual-material-status">
          <li><span>✓</span><p><b>Схема принципа</b><small>Показывает действие, состояние до и правильный результат.</small></p></li>
          <li><span>✓</span><p><b>Названия инструментов</b><small>Адаптированы под {editor} и {operatingSystem}.</small></p></li>
          <li className="pending"><span>!</span><p><b>Снимки интерфейса</b><small>Требуют реального кадра из установленной программы.</small></p></li>
        </ul>
        <small>Мы не заменяем отсутствующий снимок нейросетевой имитацией интерфейса.</small>
      </aside>
    </div>

    <div className="lesson-demo-and-compare">
      <section><div className="eyebrow">СЦЕНАРИЙ ДЕМО · 45 СЕКУНД</div><h3>Что показывает преподаватель</h3><ol>{plan.demoScript.map(item=><li key={item}>{item}</li>)}</ol></section>
      <section className="before-after-check"><div className="eyebrow">СРАВНИ «ДО / ПОСЛЕ»</div><h3>Что изменилось?</h3><div className={showAfter?"comparison-card after":"comparison-card before"}><small>{showAfter?"ПОСЛЕ":"ДО"}</small><p>{showAfter?plan.after:plan.before}</p></div><button type="button" className="btn btn-dark" onClick={()=>setShowAfter(value=>!value)}>{showAfter?"Вернуть «до»":"Показать «после»"}</button></section>
    </div>
  </section>;
}
