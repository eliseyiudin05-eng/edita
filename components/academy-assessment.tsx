"use client";

import {useMemo,useState} from "react";
import {extractVideoFrames} from "@/lib/video-frames";
import {getFreshAccessToken} from "@/lib/supabase-browser";

const quizzes=[
  {question:"Что важнее проверить перед эффектами?",answers:["Темп и понятность истории","Количество переходов","Название программы"],correct:0},
  {question:"Как понять, что первые секунды работают?",answers:["Зрителю сразу ясны тема и причина смотреть","В начале стоит длинная заставка","Музыка громче речи"],correct:0},
  {question:"Как передавать правки монтажёру?",answers:["Одним списком с приоритетами и таймкодами","Отдельными сообщениями весь день","Только словами «сделай лучше»"],correct:0},
  {question:"Что помогает оценить рост навыка?",answers:["Одинаковые критерии для нескольких работ","Один случайный комментарий","Число установленных эффектов"],correct:0},
  {question:"Что нужно сделать перед экспортом?",answers:["Проверить начало, звук, субтитры и формат","Удалить исходники","Добавить ещё один переход"],correct:0}
];

type Result={name:string;score:number;summary:string;steps:string[]};

export default function AcademyAssessment({moduleIndex,moduleName,final=false,passed,onPassed}:{moduleIndex:number;moduleName:string;final?:boolean;passed:boolean;onPassed:(result:{score:number;quizScore:number})=>Promise<void>}){
  const required=final?5:3;
  const threshold=final?85:Math.min(85,60+moduleIndex*5);
  const questions=useMemo(()=>quizzes.slice(0,final?5:3),[final]);
  const [files,setFiles]=useState<File[]>([]),[answers,setAnswers]=useState<Record<number,number>>({}),[results,setResults]=useState<Result[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const quizScore=Math.round(questions.filter((q,index)=>answers[index]===q.correct).length/questions.length*100);
  const average=results.length?Math.round(results.reduce((sum,item)=>sum+item.score,0)/results.length):0;

  async function review(){
    if(files.length!==required){setMessage(`Добавь ${required} ${required===5?"работ":"работы"}.`);return}
    if(Object.keys(answers).length!==questions.length){setMessage("Ответь на все вопросы мини‑теста.");return}
    setBusy(true);setMessage("");setResults([]);
    try{
      const accessToken=await getFreshAccessToken();
      if(!accessToken)throw new Error("Войди в аккаунт, чтобы ИИ оценил работы.");
      const reviewed:Result[]=[];
      for(let index=0;index<files.length;index++){
        setMessage(`AI разбирает работу ${index+1} из ${required}…`);
        const extracted=await extractVideoFrames(files[index],7);
        const response=await fetch("/api/ai/video-review",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({frames:extracted.frames,duration:extracted.duration,width:extracted.width,height:extracted.height,filename:files[index].name,brief:`Аттестация ступени «${moduleName}». Оцени готовность перейти дальше.`,purpose:"standalone"})});
        const data=await response.json();
        if(!response.ok)throw new Error(data?.error||"Одна из работ пока не разобрана.");
        reviewed.push({name:files[index].name,score:Number(data.review?.overall_score||0),summary:String(data.review?.summary||"Разбор готов."),steps:Array.isArray(data.review?.next_steps)?data.review.next_steps.slice(0,2):[]});
        setResults([...reviewed]);
      }
      const workAverage=Math.round(reviewed.reduce((sum,item)=>sum+item.score,0)/reviewed.length);
      if(workAverage>=threshold&&quizScore>=80){await onPassed({score:workAverage,quizScore});setMessage(final?"Экзамен сдан. Путь академии завершён — ты готов к сложным проектам.":"Ступень пройдена. Следующий уровень открыт.")}
      else setMessage(`Пока нужно усилить работы: средний балл ${workAverage}/${threshold}, тест ${quizScore}/80. Исправь подсказки AI и отправь версии ещё раз.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось провести аттестацию.")}
    finally{setBusy(false)}
  }

  return <section className={"academy-assessment "+(passed?"passed":"")}>
    <header><div><div className="eyebrow">{final?"ФИНАЛЬНЫЙ ЭКЗАМЕН":"ПЕРЕХОД НА СЛЕДУЮЩУЮ СТУПЕНЬ"}</div><h3>{final?"5 работ + общий тест":"3 работы + мини‑тест"}</h3><p>{passed?"Аттестация пройдена и сохранена в профиле.":`ИИ оценит каждую работу по шкале 1–100. Проходной балл — ${threshold}, тест — от 80.`}</p></div><div className="assessment-threshold"><strong>{threshold}</strong><span>минимум</span></div></header>
    {passed?<div className="assessment-passed">✓ Уровень подтверждён</div>:<>
      <label className="styled-file-control"><span>＋ Добавить {required} {required===5?"работ":"работы"}</span><small>{files.length} / {required} · MP4, MOV или WebM</small><input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={event=>setFiles(Array.from(event.target.files||[]).slice(0,required))}/></label>
      <div className="assessment-files">{files.map(file=><span key={file.name}>{file.name}</span>)}</div>
      <div className="assessment-quiz">{questions.map((item,index)=><fieldset key={item.question}><legend>{index+1}. {item.question}</legend>{item.answers.map((answer,answerIndex)=><label key={answer}><input type="radio" name={`assessment-${moduleIndex}-${index}`} checked={answers[index]===answerIndex} onChange={()=>setAnswers(current=>({...current,[index]:answerIndex}))}/><span>{answer}</span></label>)}</fieldset>)}</div>
      <button className="btn btn-dark" type="button" disabled={busy} onClick={()=>void review()}>{busy?"AI проверяет работы…":final?"Сдать финальный экзамен":"Проверить и открыть уровень"}</button>
    </>}
    {results.length?<div className="assessment-results">{results.map(result=><article key={result.name}><div><b>{result.name}</b><strong>{result.score}/100</strong></div><p>{result.summary}</p>{result.steps.map(step=><span key={step}>→ {step}</span>)}</article>)}</div>:null}
    {message?<div className="auth-msg">{message}</div>:null}
  </section>;
}
