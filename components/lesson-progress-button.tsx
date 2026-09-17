"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {getFreshAccessToken,getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {extractVideoFrames} from "@/lib/video-frames";
import {uploadPortfolioVideo} from "@/lib/portfolio-video-upload";
import {lessonCompletionRules,lessonQuiz} from "@/lib/academy-teaching";
import {academyLevelIndexForLesson,assessmentRequiredLessons,lessonBySlug} from "@/lib/curriculum";

export default function LessonProgressButton({slug,xp,nextSlug,theoryOnly=false}:{slug:string;xp:number;nextSlug?:string|null;theoryOnly?:boolean}){
  const [done,setDone]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [note,setNote]=useState("");
  const [answers,setAnswers]=useState<Record<number,number>>({});
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [video,setVideo]=useState<File|null>(null);
  const [reviewScore,setReviewScore]=useState<number|null>(null);
  const [reviewProof,setReviewProof]=useState<string|null>(null);
  const [reviewSummary,setReviewSummary]=useState("");
  const [shareApproved,setShareApproved]=useState(false);
  const [reviewing,setReviewing]=useState(false);
  const [experienceLevel,setExperienceLevel]=useState<unknown>("new");
  const [completedSlugs,setCompletedSlugs]=useState<string[]>([]);
  const currentLesson=lessonBySlug(slug);
  const quiz=useMemo(()=>currentLesson?lessonQuiz(currentLesson):[],[currentLesson]);
  const rules=useMemo(()=>currentLesson?lessonCompletionRules(currentLesson):null,[currentLesson]);
  const quizScore=quiz.reduce((total,question,index)=>total+(answers[index]===question.correct?1:0),0);
  const currentLevelIndex=academyLevelIndexForLesson(slug);
  const requiredLessons=currentLevelIndex>=0?assessmentRequiredLessons(currentLevelIndex,experienceLevel):[];
  const assessmentReady=currentLevelIndex>=0&&requiredLessons.length>0&&requiredLessons.every(item=>item.slug===slug||completedSlugs.includes(item.slug));
  const assessmentIndex=assessmentReady?currentLevelIndex:null;
  const proofReady=Boolean(rules)&&quizScore>=(rules?.quizRequired||0)&&note.trim().length>=(rules?.noteMinimum||0)&&(!rules?.videoRequired||(Boolean(video)&&Boolean(reviewProof)&&reviewScore!=null&&reviewScore>=rules.reviewMinimum));

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
        if(Array.isArray(saved)&&active){
          const values=saved.filter((item):item is string=>typeof item==="string");
          setCompletedSlugs(values);
          if(values.includes(slug))setDone(true);
        }
        const onboarding=JSON.parse(localStorage.getItem("kivronix_onboarding")||"{}");
        if(active)setExperienceLevel(onboarding?.level);
      }catch{}
      const accessToken=await getFreshAccessToken();
      if(!accessToken)return;
      try{
        const headers={Authorization:"Bearer "+accessToken};
        const [response,profileResponse]=await Promise.all([
          fetch("/api/lessons/progress",{headers,cache:"no-store"}),
          fetch("/api/profile/learning-preferences",{headers,cache:"no-store"}),
        ]);
        if(profileResponse.ok){
          const profile=await profileResponse.json();
          if(active)setExperienceLevel(profile?.preferences?.level);
        }
        if(!response.ok)return;
        const data=await response.json();
        if(active&&Array.isArray(data?.completedSlugs)){
          const values=data.completedSlugs.filter((item:unknown):item is string=>typeof item==="string");
          setCompletedSlugs(values);
          setDone(values.includes(slug));
        }
      }catch{}
    }
    void load();
    return()=>{active=false};
  },[slug]);

  async function reviewVideo(){
    if(!video)return;
    setReviewing(true);setNotice("");setReviewScore(null);setReviewProof(null);setShareApproved(false);
    try{
      const accessToken=await getFreshAccessToken();
      if(!accessToken)throw new Error("Войди в аккаунт, чтобы ИИ проверил работу.");
      const extracted=await extractVideoFrames(video,8);
      const response=await fetch("/api/ai/video-review",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({frames:extracted.frames,duration:extracted.duration,width:extracted.width,height:extracted.height,filename:video.name,brief:`Практическое задание урока «${currentLesson?.title||slug}». Критерии: ${currentLesson?.checklist.join(", ")||"результат урока"}.`,purpose:"standalone",lessonSlug:slug})});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"ИИ не смог проверить видео.");
      const score=Number(data.review?.overall_score||0);setReviewScore(score);setReviewProof(typeof data.reviewProof==="string"?data.reviewProof:null);setReviewSummary(String(data.review?.summary||"Разбор готов."));
    }catch(error){setNotice(error instanceof Error?error.message:"Не удалось проверить видео.")}finally{setReviewing(false)}
  }

  async function complete(){
    if(saving||done||!confirmed||!proofReady||!rules)return;
    setSaving(true);setNotice("");
    try{
      const accessToken=await getFreshAccessToken();
      if(!accessToken)throw new Error("Сессия устарела. Обнови страницу и войди снова.");
      const response=await fetch("/api/lessons/progress",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
        body:JSON.stringify({
          slug,completed:true,taskConfirmed:true,submissionNote:note.trim(),
          quizAnswers:quiz.map((_,index)=>answers[index]),
          evidenceType:rules.videoRequired?"video_review":theoryOnly?"reflection":"work_log",
          reviewScore,reviewProof,
        })
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Ошибка сохранения прогресса.");
      void fetch("/api/referral/qualify",{method:"POST",headers:{Authorization:"Bearer "+accessToken}}).catch(()=>{});

      let publicationWarning="";
      if(video&&reviewScore!=null&&reviewScore>=75&&shareApproved){
        try{
          const {data:{user}}=await getSupabaseBrowserClient().auth.getUser();
          if(!user)throw new Error("аккаунт не удалось подтвердить");
          const videoUrl=await uploadPortfolioVideo(video,user.id);
          const publication=await fetch("/api/portfolio",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({title:`Учебная работа · ${slug}`,videoUrl,tags:["обучение","задание"],aiScore:reviewScore,publicationConsent:true,sourceLabel:"Учебное задание"})});
          if(!publication.ok){
            const publicationData=await publication.json().catch(()=>({}));
            throw new Error(publicationData?.error?.message||publicationData?.error||"сервис публикации временно недоступен");
          }
        }catch(error){
          publicationWarning=` Урок и опыт сохранены, но видео не добавилось в портфолио: ${error instanceof Error?error.message:"неизвестная ошибка"}. Попробуй опубликовать работу позже из раздела «Мои работы».`;
        }
      }

      const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
      const values=Array.isArray(saved)?saved.filter((item):item is string=>typeof item==="string"):[];
      const nextCompleted=Array.from(new Set([...values,...completedSlugs,slug]));
      localStorage.setItem("kivronix_lesson_done",JSON.stringify(nextCompleted));
      setCompletedSlugs(nextCompleted);
      setDone(true);
      const readyForAssessment=currentLevelIndex>=0&&assessmentRequiredLessons(currentLevelIndex,experienceLevel).every(item=>nextCompleted.includes(item.slug));
      setNotice((readyForAssessment?"Уровень завершён. Открываем аттестацию…":theoryOnly?"Понимание подтверждено. Следующий урок открыт.":"Работа принята. Следующий урок открыт.")+publicationWarning);
      window.dispatchEvent(new CustomEvent("kivronix:lesson-completed",{detail:{slug}}));
      if(readyForAssessment)window.setTimeout(()=>window.location.assign(`/academy/assessment/${currentLevelIndex}`),650);
    }catch(error){
      setNotice(error instanceof Error?error.message:"Ошибка сохранения задания.");
    }finally{setSaving(false)}
  }

  if(!currentLesson||!rules)return null;

  return <div className="lesson-progress-action">
    {!done?<>
      <section className="lesson-mini-quiz">
        <div className="eyebrow">МИНИ-ТЕСТ · НУЖНО {rules.quizRequired} ИЗ {quiz.length}</div>
        <h3>Проверь понимание до сдачи</h3>
        {quiz.map((question,index)=><fieldset key={question.question}><legend>{index+1}. {question.question}</legend>{question.answers.map((answer,answerIndex)=>{const chosen=answers[index]===answerIndex;const answered=answers[index]!=null;const correct=question.correct===answerIndex;return <label className={chosen?(correct?"chosen correct":"chosen wrong"):answered&&correct?"correct":""} key={answer}><input type="radio" name={`lesson-quiz-${slug}-${index}`} checked={chosen} onChange={()=>setAnswers(current=>({...current,[index]:answerIndex}))}/><span>{answer}</span></label>})}{answers[index]!=null?<small className={answers[index]===question.correct?"quiz-explanation correct":"quiz-explanation wrong"}>{answers[index]===question.correct?"Верно. ":"Пока нет. "}{question.explanation}</small>:null}</fieldset>)}
        <p className="lesson-quiz-score">Результат: <b>{quizScore} из {quiz.length}</b>{quizScore>=rules.quizRequired?" · тест пройден":" · попробуй исправить ответы"}</p>
      </section>

      <label className="lesson-evidence-note"><span>{rules.evidenceLabel}</span><textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={1000} rows={3} placeholder={theoryOnly?"Например: я понял, что… В своём ролике применю это так…":"Например: удалил две паузы, сравнил до/после и проверил, что слова звучат целиком."}/><small>{note.trim().length}/{rules.noteMinimum} минимум</small></label>

      {!theoryOnly?<div className="lesson-video-review"><label className="styled-file-control"><span>{rules.videoRequired?"Добавь видео задания — обязательно":"Добавить видео для ИИ-разбора — по желанию"}</span><small>{video?video.name:"MP4, MOV или WebM"}</small><input type="file" accept="video/*" onChange={event=>{setVideo(event.target.files?.[0]||null);setReviewScore(null);setReviewProof(null);setShareApproved(false)}}/></label>{video?<button className="btn btn-ghost" type="button" onClick={()=>void reviewVideo()} disabled={reviewing}>{reviewing?"ИИ проверяет…":"Проверить видео с ИИ"}</button>:null}{rules.videoRequired&&reviewScore==null?<small>Это проектный урок: для завершения нужен ИИ-разбор не ниже {rules.reviewMinimum}/100.</small>:null}{reviewScore!=null?<div className={reviewScore>=75?"ai-publish-offer good":"ai-publish-offer"}><b>ИИ‑оценка по кадрам: {reviewScore}/100</b><p>{reviewSummary}</p><small>ИИ видит ключевые кадры и технические параметры, но не слышит звук и не оценивает непрерывность движения. Звук и склейки проверь по чек-листу сам.</small>{reviewScore>=75?<label><input type="checkbox" checked={shareApproved} onChange={event=>setShareApproved(event.target.checked)}/><span>Отдельно разрешаю опубликовать это видео в общей ленте KIVRONIX Video</span></label>:<span>Сначала улучши ролик по подсказкам. Публикация пока не предлагается.</span>}</div>:null}</div>:null}

      <label className="task-confirm-row"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>{theoryOnly?"Я ответил своими словами и сверил понимание с тестом.":"Я действительно выполнил действие и проверил результат по критериям урока."}</span></label>
      <button className="btn btn-lime" type="button" onClick={complete} disabled={saving||!confirmed||!proofReady}>{saving?"Сохраняю…":!proofReady?"Сначала заверши проверку":theoryOnly?`Подтвердить понимание · +${xp} опыта`:`Сдать работу · +${xp} опыта`}</button>
    </>:<div className="lesson-complete-box"><b>{theoryOnly?"Понимание подтверждено":"Работа выполнена"}</b><span>{assessmentIndex!=null?"Уровень завершён — пора подтвердить навыки.":"Прогресс сохранён, следующий урок открыт."}</span>{assessmentIndex!=null?<Link className="btn btn-dark" href={`/academy/assessment/${assessmentIndex}`}>Перейти к аттестации →</Link>:nextSlug?<Link className="btn btn-dark" href={"/academy/"+nextSlug}>Перейти к следующему уроку →</Link>:<Link className="btn btn-dark" href="/platform#academy">Вернуться в Академию</Link>}</div>}
    {notice?<small role="status" aria-live="polite">{notice}</small>:null}
  </div>;
}
