"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {extractVideoFrames} from "@/lib/video-frames";
import {uploadPortfolioVideo} from "@/lib/portfolio-video-upload";
import {curriculumModules,lessonBySlug,normalizeExperienceLevel} from "@/lib/curriculum";

export default function LessonProgressButton({slug,xp,nextSlug,theoryOnly=false}:{slug:string;xp:number;nextSlug?:string|null;theoryOnly?:boolean}){
  const [done,setDone]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [video,setVideo]=useState<File|null>(null);
  const [reviewScore,setReviewScore]=useState<number|null>(null);
  const [reviewSummary,setReviewSummary]=useState("");
  const [shareApproved,setShareApproved]=useState(false);
  const [reviewing,setReviewing]=useState(false);
  const [isPro,setIsPro]=useState(false);
  const currentLesson=lessonBySlug(slug);
  const nextLesson=nextSlug?lessonBySlug(nextSlug):null;
  const currentModuleIndex=curriculumModules.findIndex(group=>group.module===currentLesson?.module);
  const assessmentIndex=currentModuleIndex>=0&&(!nextLesson||nextLesson.module!==currentLesson?.module)&&!isPro?currentModuleIndex:null;

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
        if(Array.isArray(saved)&&saved.includes(slug)&&active)setDone(true);
        const onboarding=JSON.parse(localStorage.getItem("kivronix_onboarding")||"{}");
        if(active)setIsPro(normalizeExperienceLevel(onboarding?.level)==="pro");
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
          if(active)setIsPro(normalizeExperienceLevel(profile?.preferences?.level)==="pro");
        }
        if(!response.ok)return;
        const data=await response.json();
        if(active)setDone(Array.isArray(data?.completedSlugs)&&data.completedSlugs.includes(slug));
      }catch{}
    }
    void load();
    return()=>{active=false};
  },[slug]);

  async function reviewVideo(){
    if(!video)return;
    setReviewing(true);setNotice("");setReviewScore(null);setShareApproved(false);
    try{
      const accessToken=await getFreshAccessToken();
      if(!accessToken)throw new Error("Войди в аккаунт, чтобы ИИ проверил работу.");
      const extracted=await extractVideoFrames(video,7);
      const response=await fetch("/api/ai/video-review",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({frames:extracted.frames,duration:extracted.duration,width:extracted.width,height:extracted.height,filename:video.name,brief:`Практическое задание урока ${slug}`,purpose:"standalone"})});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"ИИ не смог проверить видео.");
      const score=Number(data.review?.overall_score||0);setReviewScore(score);setReviewSummary(String(data.review?.summary||"Разбор готов."));
    }catch(error){setNotice(error instanceof Error?error.message:"Не удалось проверить видео.")}finally{setReviewing(false)}
  }

  async function complete(){
    if(saving||done||!confirmed)return;
    setSaving(true);setNotice("");
    try{
      const accessToken=await getFreshAccessToken();
      if(!accessToken)throw new Error("Сессия устарела. Обнови страницу и войди снова.");
      {
        const response=await fetch("/api/lessons/progress",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
          body:JSON.stringify({slug,completed:true,taskConfirmed:true,submissionNote:note})
        });
        const data=await response.json();
        if(!response.ok)throw new Error(data?.error||"Ошибка сохранения прогресса.");
        void fetch("/api/referral/qualify",{method:"POST",headers:{Authorization:"Bearer "+accessToken}}).catch(()=>{});
      }

      if(video&&reviewScore!=null&&reviewScore>=75&&shareApproved){
        const {data:{user}}=await getSupabaseBrowserClient().auth.getUser();
        if(!user)throw new Error("Не удалось подтвердить аккаунт для публикации.");
        const videoUrl=await uploadPortfolioVideo(video,user.id);
        const publication=await fetch("/api/portfolio",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},body:JSON.stringify({title:`Учебная работа · ${slug}`,videoUrl,tags:["обучение","задание"],aiScore:reviewScore,publicationConsent:true,sourceLabel:"Учебное задание"})});
        if(!publication.ok){const data=await publication.json().catch(()=>({}));throw new Error(data?.error?.message||data?.error||"Задание сохранено, но видео не опубликовано.")}
      }

      const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
      const values=Array.isArray(saved)?saved.filter((item):item is string=>typeof item==="string"):[];
      localStorage.setItem("kivronix_lesson_done",JSON.stringify(Array.from(new Set([...values,slug]))));
      setDone(true);
      setNotice(assessmentIndex!=null?"Ступень завершена. Открываем аттестацию…":theoryOnly?"Урок завершён. Следующий урок открыт.":"Задание принято. Следующий урок открыт.");
      window.dispatchEvent(new CustomEvent("kivronix:lesson-completed",{detail:{slug}}));
      if(assessmentIndex!=null)window.setTimeout(()=>window.location.assign(`/academy/assessment/${assessmentIndex}`),650);
    }catch(error){
      setNotice(error instanceof Error?error.message:"Ошибка сохранения задания.");
    }finally{setSaving(false)}
  }

  return <div className="lesson-progress-action">
    {!done?<>
      <label className="task-confirm-row"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>{theoryOnly?"Я прочитал урок и могу объяснить его главную мысль своими словами.":"Я выполнил задание и проверил результат по чек-листу."}</span></label>
      {!theoryOnly?<><textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={1000} rows={2} placeholder="Можно написать, что получилось или где было сложно"/><div className="lesson-video-review"><label className="styled-file-control"><span>Добавить видео задания для проверки</span><small>{video?video.name:"Необязательно · MP4, MOV или WebM"}</small><input type="file" accept="video/*" onChange={event=>{setVideo(event.target.files?.[0]||null);setReviewScore(null);setShareApproved(false)}}/></label>{video?<button className="btn btn-ghost" type="button" onClick={()=>void reviewVideo()} disabled={reviewing}>{reviewing?"ИИ проверяет…":"Проверить видео с ИИ"}</button>:null}{reviewScore!=null?<div className={reviewScore>=75?"ai-publish-offer good":"ai-publish-offer"}><b>ИИ‑оценка: {reviewScore}/100</b><p>{reviewSummary}</p>{reviewScore>=75?<label><input type="checkbox" checked={shareApproved} onChange={event=>setShareApproved(event.target.checked)}/><span>Разрешаю опубликовать это видео в общей ленте KIVRONIX Video</span></label>:<span>Сначала улучши ролик по подсказкам. Публикация пока не предлагается.</span>}</div>:null}</div></>:null}
      <button className="btn btn-lime" type="button" onClick={complete} disabled={saving||!confirmed}>{saving?"Сохраняю…":theoryOnly?"Всё понятно · +"+xp+" опыта":"Сдать задание · +"+xp+" опыта"}</button>
    </>:<div className="lesson-complete-box"><b>{theoryOnly?"Теория пройдена":"Задание выполнено"}</b><span>{assessmentIndex!=null?"Ступень завершена — пора подтвердить навыки.":"Прогресс сохранён, следующий урок открыт."}</span>{assessmentIndex!=null?<Link className="btn btn-dark" href={`/academy/assessment/${assessmentIndex}`}>Перейти к аттестации →</Link>:nextSlug?<Link className="btn btn-dark" href={"/academy/"+nextSlug}>Перейти к следующему уроку →</Link>:<Link className="btn btn-dark" href="/platform#academy">Вернуться в Академию</Link>}</div>}
    {notice?<small>{notice}</small>:null}
  </div>;
}
