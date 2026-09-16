"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {useEffect,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";
import {lessonAccess,nextAvailableLesson} from "@/lib/curriculum";

export default function LessonRouteGate({children}:{requiredSlugs:string[];previousSlug?:string|null;children:React.ReactNode}){
  const router=useRouter();
  const pathname=usePathname();
  const [checking,setChecking]=useState(true);
  const [unlocked,setUnlocked]=useState(false);
  const [returnSlug,setReturnSlug]=useState<string|null>(null);
  const [lockedByAssessment,setLockedByAssessment]=useState(false);

  useEffect(()=>{
    let active=true;
    async function check(){
      let completed:string[]=[];
      let passed:number[]=[];
      let level:unknown="new";
      try{
        const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
        if(Array.isArray(saved))completed=saved.filter((item):item is string=>typeof item==="string");
        const savedAssessments=JSON.parse(localStorage.getItem("kivronix_academy_assessments")||"[]");
        if(Array.isArray(savedAssessments))passed=savedAssessments.filter((item):item is number=>Number.isInteger(item));
        const savedOnboarding=JSON.parse(localStorage.getItem("kivronix_onboarding")||"{}");
        if(savedOnboarding&&typeof savedOnboarding==="object")level=savedOnboarding.level;
      }catch{}

      const applyAccess=()=>{
        const slug=pathname.split("/").pop()||"";
        const access=lessonAccess(slug,completed,passed,level);
        const available=nextAvailableLesson(completed,passed,level);
        if(active){
          setUnlocked(access.unlocked);
          setLockedByAssessment(access.reason==="assessment");
          setReturnSlug(available?.slug||null);
          setChecking(false);
        }
      };

      const accessToken=await getFreshAccessToken();
      if(!accessToken){
        router.replace("/login?from="+encodeURIComponent(pathname));
        return;
      }
      {
        const headers={Authorization:"Bearer "+accessToken};
        const responses=await Promise.all([
          fetch("/api/profile/learning-preferences",{headers,cache:"no-store"}),
          fetch("/api/lessons/progress",{headers,cache:"no-store"}),
          fetch("/api/academy/assessments",{headers,cache:"no-store"}),
        ]).catch(()=>null);
        if(!responses){
          applyAccess();
          return;
        }
        const [profileResponse,progressResponse,assessmentResponse]=responses;
        if(!profileResponse.ok||!progressResponse.ok||!assessmentResponse.ok){
          applyAccess();
          return;
        }
        const [profile,progress,assessments]=await Promise.all([profileResponse.json(),progressResponse.json(),assessmentResponse.json()]);
        const fromAccount=Array.isArray(progress?.completedSlugs)?progress.completedSlugs.filter((slug:unknown):slug is string=>typeof slug==="string"):[];
        completed=fromAccount;
        passed=Array.isArray(assessments.passed)?assessments.passed:[];
        level=profile?.preferences?.level||level;
        applyAccess();
        try{localStorage.setItem("kivronix_lesson_done",JSON.stringify(completed))}catch{}
        return;
      }
    }
    void check();
    return()=>{active=false};
  },[pathname,router]);

  if(checking)return <div className="lesson-gate-card"><b>Проверяем вход и прогресс…</b></div>;
  if(!unlocked)return <div className="lesson-gate-card locked"><div className="eyebrow">СЛЕДУЮЩАЯ СТУПЕНЬ ПОКА ЗАКРЫТА</div><h2>{lockedByAssessment?"Сначала пройди аттестацию текущей ступени":"Этот урок пока недоступен"}</h2><p>{lockedByAssessment?"Все уроки текущей ступени можно открывать в любом порядке. После аттестации откроется следующий блок.":"Вернись в учебный план и выбери открытый урок."}</p><div>{returnSlug?<Link className="btn btn-dark" href={"/academy/"+returnSlug}>Открыть доступный урок</Link>:null}<Link className="btn btn-ghost" href="/platform#academy">Перейти к учебному плану</Link></div></div>;
  return <>{children}</>;
}
