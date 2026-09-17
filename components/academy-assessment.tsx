"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {academyAssessmentConfig} from "@/lib/academy-assessment";
import {extractVideoFrames} from "@/lib/video-frames";
import {getFreshAccessToken} from "@/lib/supabase-browser";
import {academyLevels,assessmentAvailable} from "@/lib/curriculum";

type Review={
  name:string;
  reviewProof:string;
  overall_score:number;
  hook_score:number;
  pacing_score:number;
  subtitles_score:number;
  visual_variety_score:number;
  brief_match_score:number;
  format_score:number;
  summary:string;
  strengths:string[];
  next_steps:string[];
};

const manualChecks=[
  ["audio","Голос понятен, музыка и эффекты ему не мешают."],
  ["continuity","Склейки, движение и переходы просмотрены в реальном времени."],
  ["rights","У меня есть право использовать исходники, музыку, шрифты и графику."],
  ["export","Готовый файл открывается; начало, конец, формат и длительность проверены."],
] as const;

export default function AcademyAssessment({moduleIndex,moduleName,final=false}:{moduleIndex:number;moduleName:string;final?:boolean}){
  const config=useMemo(()=>academyAssessmentConfig(moduleIndex),[moduleIndex]);
  const [files,setFiles]=useState<File[]>([]);
  const [answers,setAnswers]=useState<Record<number,number>>({});
  const [selfChecks,setSelfChecks]=useState<Record<string,boolean>>({});
  const [results,setResults]=useState<Review[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [passed,setPassed]=useState(false);
  const [checking,setChecking]=useState(true);
  const [available,setAvailable]=useState(false);
  const [accessMessage,setAccessMessage]=useState("");
  const average=results.length?Math.round(results.reduce((sum,item)=>sum+item.overall_score,0)/results.length):0;
  const nextLessonSlug=academyLevels[moduleIndex+1]?.lessons[0]?.slug||null;

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const token=await getFreshAccessToken();
        if(!token)return;
        const headers={Authorization:"Bearer "+token};
        const [assessmentResponse,progressResponse,profileResponse]=await Promise.all([
          fetch("/api/academy/assessments",{headers,cache:"no-store"}),
          fetch("/api/lessons/progress",{headers,cache:"no-store"}),
          fetch("/api/profile/learning-preferences",{headers,cache:"no-store"}),
        ]);
        if(!assessmentResponse.ok||!progressResponse.ok||!profileResponse.ok){
          if(active)setAccessMessage("Не удалось проверить учебный прогресс. Обнови страницу и попробуй ещё раз — введённые данные не изменились.");
          return;
        }
        const [assessments,progress,profile]=await Promise.all([
          assessmentResponse.json(),progressResponse.json(),profileResponse.json(),
        ]);
        const passedLevels=Array.isArray(assessments?.passed)?assessments.passed.filter((item:unknown):item is number=>Number.isInteger(item)):[];
        const completedSlugs=Array.isArray(progress?.completedSlugs)?progress.completedSlugs.filter((item:unknown):item is string=>typeof item==="string"):[];
        const alreadyPassed=passedLevels.includes(moduleIndex);
        if(active){
          setPassed(alreadyPassed);
          setAvailable(alreadyPassed||assessmentAvailable(moduleIndex,completedSlugs,passedLevels,profile?.preferences?.level));
        }
      }catch{
        if(active)setAccessMessage("Не удалось проверить учебный прогресс из-за соединения. Обнови страницу, когда связь восстановится.");
      }finally{if(active)setChecking(false)}
    }
    void load();
    return()=>{active=false};
  },[moduleIndex]);

  function chooseFiles(list:FileList|null){
    const selected=Array.from(list||[]).filter(file=>file.type.startsWith("video/")).slice(0,config.requiredVideos);
    setFiles(selected);
    setResults([]);
    setMessage(selected.length?`${selected.length} из ${config.requiredVideos} видео готовы к проверке.`:"");
  }

  async function review(){
    if(files.length!==config.requiredVideos){setMessage(`Для этой проверки добавь ${config.requiredVideos} ${videoWord(config.requiredVideos)}.`);return}
    if(Object.keys(answers).length!==config.questions.length){setMessage("Ответь на все вопросы проверки знаний.");return}
    if(!["audio","continuity","rights","export"].every(key=>selfChecks[key]===true)){setMessage("Заверши ручную проверку звука, склеек, прав и готового файла.");return}
    setBusy(true);setMessage("");setResults([]);
    try{
      const accessToken=await getFreshAccessToken();
      if(!accessToken)throw new Error("Войди в аккаунт, чтобы ИИ оценил работы.");
      const reviewed:Review[]=[];
      for(let index=0;index<files.length;index++){
        setMessage(`ИИ изучает видео ${index+1} из ${config.requiredVideos}: выбирает кадры и сверяет критерии…`);
        const extracted=await extractVideoFrames(files[index],8);
        const response=await fetch("/api/ai/video-review",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
          body:JSON.stringify({
            frames:extracted.frames,
            duration:extracted.duration,
            width:extracted.width,
            height:extracted.height,
            filename:files[index].name,
            brief:`Аттестация уровня «${moduleName}». Задание: ${config.task} Критерии: ${config.criteria.join(", ")}.`,
            purpose:"academy_assessment",
            moduleIndex,
            difficulty:config.difficulty,
          })
        });
        const data=await response.json();
        if(!response.ok||!data.review)throw new Error(data?.error||"Одна из работ пока не разобрана.");
        if(typeof data.reviewProof!=="string")throw new Error("Не удалось подтвердить результат ИИ-проверки. Запусти разбор ещё раз.");
        const item:Review={name:files[index].name,reviewProof:data.reviewProof,...data.review};
        reviewed.push(item);
        setResults([...reviewed]);
      }
      const response=await fetch("/api/academy/assessments",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
        body:JSON.stringify({
          moduleIndex,
          moduleName,
          final,
          answers:config.questions.map((_,index)=>answers[index]),
          videoCount:reviewed.length,
          reviews:reviewed.map(item=>({reviewProof:item.reviewProof})),
          selfChecks,
        })
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Аттестация пока не пройдена.");
      setPassed(true);
      try{
        const saved=JSON.parse(localStorage.getItem("kivronix_academy_assessments_v2")||"[]");
        const next=Array.isArray(saved)&&saved.includes(moduleIndex)?saved:[...(Array.isArray(saved)?saved:[]),moduleIndex];
        localStorage.setItem("kivronix_academy_assessments_v2",JSON.stringify(next));
      }catch{}
      setMessage(final?"Финальная аттестация пройдена. Полный маршрут завершён.":"Аттестация пройдена. Следующий блок обучения открыт.");
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось провести аттестацию.")}
    finally{setBusy(false)}
  }

  if(checking)return <section className="assessment-loading"><span className="assessment-ai-orb">✦</span><b>Проверяем прогресс аттестации…</b></section>;

  if(!available)return <section className="assessment-success assessment-locked" role="status">
    <div className="assessment-success-mark">⌁</div>
    <div><div className="eyebrow">АТТЕСТАЦИЯ ПОКА ЗАКРЫТА</div><h1>{accessMessage?"Не удалось проверить прогресс":"Сначала заверши текущий этап"}</h1><p>{accessMessage||"Задание аттестации откроется после всех обязательных уроков уровня и предыдущих аттестаций. Твой сохранённый прогресс не изменился."}</p></div>
    <Link className="btn btn-dark" href="/platform#academy">Вернуться к учебному плану</Link>
  </section>;

  if(passed)return <section className="assessment-success">
    <div className="assessment-success-mark">✓</div>
    <div><div className="eyebrow">УРОВЕНЬ ПОДТВЕРЖДЁН</div><h1>{final?"Маршрут завершён":"Следующий уровень уже открыт"}</h1><p>{final?"Ты прошёл финальную проверку знаний и работ. Можно возвращаться к урокам и усиливать портфолио.":"Результат сохранён в профиле. Возвращайся в Академию — первый урок следующего уровня уже доступен."}</p>{results.length?<b>Средняя ИИ‑оценка: {average}/100</b>:null}</div>
    <Link className="btn btn-lime" href={final||!nextLessonSlug?"/platform#academy":"/academy/"+nextLessonSlug}>{final?"Вернуться в Академию":"Открыть первый урок следующего блока →"}</Link>
  </section>;

  return <div className="assessment-workspace">
    <section className="assessment-hero-panel">
      <div><div className="eyebrow">{final?"ВЫПУСК · ПОСЛЕ УРОВНЯ PRO":`АТТЕСТАЦИЯ · ${config.difficulty}`}</div><h1>{moduleName}</h1><p>{config.task}</p><div className="assessment-criteria">{config.criteria.map(item=><span key={item}>✓ {item}</span>)}</div></div>
      <div className="assessment-threshold-large"><strong>{config.threshold}</strong><span>проходной балл</span><small>{config.difficulty}</small></div>
    </section>

    <div className="assessment-progress-row">
      <span className={files.length===config.requiredVideos?"done":"active"}><b>1</b>Добавь видео</span>
      <span className={Object.keys(answers).length===config.questions.length?"done":files.length===config.requiredVideos?"active":""}><b>2</b>Ответь на вопросы</span>
      <span className={results.length?"active":""}><b>3</b>Получи ИИ-разбор</span>
      <span><b>4</b>{final?"Получи выпуск":"Открой блок"}</span>
    </div>

    <div className="assessment-main-grid">
      <div className="assessment-primary-column">
        <section className="assessment-panel">
          <header><div><div className="eyebrow">РАБОТЫ ДЛЯ ПРОВЕРКИ</div><h2>{config.requiredVideos} {videoWord(config.requiredVideos)} по сложности уровня</h2></div><span>{files.length}/{config.requiredVideos}</span></header>
          <p className="assessment-privacy">Полное видео остаётся на устройстве. Для ИИ-проверки браузер отправит только 8 ключевых кадров, длительность и размер.</p>
          <label className="assessment-dropzone">
            <span className="assessment-upload-icon">↥</span>
            <b>{files.length?"Заменить выбранные видео":"Выбрать видео"}</b>
            <small>MP4, MOV или WebM · одновременно до {config.requiredVideos}</small>
            <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple={config.requiredVideos>1} onChange={event=>chooseFiles(event.target.files)}/>
          </label>
          {files.length?<div className="assessment-file-list">{files.map((file,index)=><article key={`${file.name}-${file.lastModified}`}><span>{index+1}</span><div><b>{file.name}</b><small>{formatBytes(file.size)}</small></div><button type="button" aria-label={`Убрать ${file.name}`} onClick={()=>{setFiles(current=>current.filter((_,itemIndex)=>itemIndex!==index));setResults([])}}>×</button></article>)}</div>:null}
        </section>

        <section className="assessment-panel assessment-brief-panel">
          <div className="eyebrow">ТОЧНОЕ ЗАДАНИЕ</div><h2>Что подготовить и сдать</h2>
          <div className="assessment-brief-columns"><div><h3>Набор материалов</h3><ul>{config.sourcePack.map(item=><li key={item}>{item}</li>)}</ul></div><div><h3>Результат</h3><p>{config.deliverable}</p><h3>Технические требования</h3><ul>{config.technicalRequirements.map(item=><li key={item}>{item}</li>)}</ul></div></div>
        </section>

        <section className="assessment-panel assessment-quiz-light">
          <div className="eyebrow">ПРОВЕРКА ЗНАНИЙ</div><h2>Три коротких вопроса</h2><p>Нужно набрать минимум {config.quizThreshold} баллов. Ответы относятся к урокам этого уровня.</p>
          <div className="assessment-question-list">{config.questions.map((item,index)=><fieldset key={item.question}><legend><span>{index+1}</span>{item.question}</legend>{item.answers.map((answer,answerIndex)=><label className={answers[index]===answerIndex?"selected":""} key={answer}><input type="radio" name={`assessment-${moduleIndex}-${index}`} checked={answers[index]===answerIndex} onChange={()=>setAnswers(current=>({...current,[index]:answerIndex}))}/><span>{answer}</span></label>)}</fieldset>)}</div>
        </section>

        <section className="assessment-panel assessment-self-check">
          <div className="eyebrow">РУЧНАЯ ПРОВЕРКА · ИИ ЭТОГО НЕ СЛЫШИТ</div><h2>Посмотри каждый файл целиком</h2><p>ИИ получает только восемь кадров. Эти четыре пункта подтверждаешь ты после просмотра готового файла.</p>
          {manualChecks.map(([key,label])=><label key={key}><input type="checkbox" checked={selfChecks[key]===true} onChange={event=>setSelfChecks(current=>({...current,[key]:event.target.checked}))}/><span>{label}</span></label>)}
        </section>

        <button className="assessment-submit" type="button" disabled={busy} onClick={()=>void review()}><span>{busy?"✦":"→"}</span><div><b>{busy?"ИИ проводит проверку…":final?"Сдать выпускной экзамен":"Проверить работы и открыть следующий уровень"}</b><small>{busy?"Можно оставаться на странице — результаты появятся ниже.":`Видео: ${files.length}/${config.requiredVideos} · тест: ${Object.keys(answers).length}/${config.questions.length} · ручная проверка: ${Object.values(selfChecks).filter(Boolean).length}/4`}</small></div></button>
        {message?<div className="assessment-message">{message}</div>:null}
      </div>

      <aside className="assessment-ai-column">
        <section className="assessment-ai-card"><span className="assessment-ai-orb">✦</span><div><div className="eyebrow">ИИ-ЭКСПЕРТ KIVRONIX</div><h3>Проверка по критериям</h3><p>ИИ оценит только видимые признаки и технические данные. Звук, права и непрерывность ты подтверждаешь отдельным чек‑листом.</p></div><dl><div><dt>Сложность</dt><dd>{config.difficulty}</dd></div><div><dt>Видео</dt><dd>{config.requiredVideos}</dd></div><div><dt>Проходной балл</dt><dd>{config.threshold}/100</dd></div><div><dt>Мини‑тест</dt><dd>{config.quizThreshold}/100</dd></div></dl></section>
        <section className="assessment-rubric-card"><div className="eyebrow">РУБРИКА · 100 БАЛЛОВ</div>{config.rubric.map(item=><article key={item.name}><div><b>{item.name}</b><strong>{item.points}</strong></div><p>{item.check}</p></article>)}<details><summary>Критические ошибки и пересдача</summary><ul>{config.criticalErrors.map(item=><li key={item}>{item}</li>)}</ul><p>{config.retry}</p></details></section>
        {results.length?<section className="assessment-live-score"><div><span>Средний балл</span><strong>{average}</strong></div><div className="assessment-score-bar"><i style={{width:`${average}%`}}/></div><small>{average>=config.threshold?"Баллов достаточно. Проверяем тест и сохраняем результат.":`До проходного уровня: ${Math.max(0,config.threshold-average)} баллов.`}</small></section>:null}
      </aside>
    </div>

    {results.length?<section className="assessment-review-results"><header><div className="eyebrow">РЕЗУЛЬТАТЫ ИИ-ПРОВЕРКИ</div><h2>Разбор каждой работы по критериям</h2></header><div>{results.map(result=><article key={result.name}><header><div><small>{result.name}</small><h3>{result.summary}</h3></div><strong>{result.overall_score}<span>/100</span></strong></header><div className="assessment-criterion-results">{config.rubric.map((criterion,index)=><div key={criterion.name}><span><b>{criterion.name}</b><strong>{criterionScore(result,index)}/100</strong></span><p>{criterion.check}</p><small><b>Следующее упражнение:</b> {result.next_steps?.[index%Math.max(1,result.next_steps.length)]||"Сравни текущую версию с критериями и исправь одно самое заметное отличие."}</small></div>)}</div>{result.strengths?.length?<p><b>Уже хорошо:</b> {result.strengths.slice(0,2).join(" · ")}</p>:null}</article>)}</div></section>:null}
  </div>;
}

function videoWord(value:number){return value===1?"ролик":"ролика"}
function formatBytes(value:number){return value>=1024*1024?`${(value/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.round(value/1024))} КБ`}
function criterionScore(result:Review,index:number){return [result.brief_match_score,result.pacing_score,Math.round((result.subtitles_score+result.visual_variety_score)/2),result.format_score][index%4]}
