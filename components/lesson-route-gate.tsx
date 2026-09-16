"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {useEffect,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";
import {lessonAccess,nextAvailableLesson} from "@/lib/curriculum";

export default function LessonRouteGate({requiredSlugs,previousSlug,children}:{requiredSlugs:string[];previousSlug?:string|null;children:React.ReactNode}){
  const router=useRouter();
  const pathname=usePathname();
  const [checking,setChecking]=useState(true);
  const [unlocked,setUnlocked]=useState(false);
  const [returnSlug,setReturnSlug]=useState<string|null>(previousSlug||null);
  const [lockedByAssessment,setLockedByAssessment]=useState(false);

  useEffect(()=>{
    let active=true;
    async function check(){
      let completed:string[]=[];
      try{
        const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
        if(Array.isArray(saved))completed=saved.filter((item):item is string=>typeof item==="string");
      }catch{}

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
          if(active)setChecking(false);
          return;
        }
        const [profileResponse,progressResponse,assessmentResponse]=responses;
        if(!profileResponse.ok||!progressResponse.ok||!assessmentResponse.ok){
          if(active)setChecking(false);
          return;
        }
        const [profile,progress,assessments]=await Promise.all([profileResponse.json(),progressResponse.json(),assessmentResponse.json()]);
        const fromAccount=Array.isArray(progress?.completedSlugs)?progress.completedSlugs.filter((slug:unknown):slug is string=>typeof slug==="string"):[];
        completed=fromAccount;
        const passed=Array.isArray(assessments.passed)?assessments.passed:[];
        const level=profile?.preferences?.level;
        const access=lessonAccess(pathname.split("/").pop()||"",completed,passed,level);
        const available=nextAvailableLesson(completed,passed,level);
        if(active){setUnlocked(access.unlocked);setLockedByAssessment(access.reason==="assessment");setReturnSlug(available?.slug||previousSlug||null);setChecking(false)}
        try{localStorage.setItem("kivronix_lesson_done",JSON.stringify(completed))}catch{}
        return;
      }

      if(active){setUnlocked(requiredSlugs.every(slug=>completed.includes(slug)));setChecking(false)}
    }
    void check();
    return()=>{active=false};
  },[pathname,requiredSlugs,router]);

  if(checking)return <div className="lesson-gate-card"><b>Проверяем вход и прогресс…</b></div>;
  if(!unlocked)return <div className="lesson-gate-card locked"><div className="eyebrow">УРОК ПОКА ЗАКРЫТ</div><h2>{lockedByAssessment?"Сначала пройди промежуточную аттестацию":"Сначала заверши доступный урок"}</h2><p>{lockedByAssessment?"После аттестации откроется следующая ступень.":"Мы нашли ближайший урок, который уже можно открыть и выполнить."}</p><div>{returnSlug?<Link className="btn btn-dark" href={"/academy/"+returnSlug}>Открыть доступный урок</Link>:null}<Link className="btn btn-ghost" href="/platform#academy">Открыть учебный план</Link></div></div>;
  return <>{children}</>;
}
