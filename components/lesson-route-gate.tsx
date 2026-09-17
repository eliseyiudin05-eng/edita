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
  const [accessError,setAccessError]=useState("");

  useEffect(()=>{
    let active=true;
    async function check(){
      let completed:string[]=[];
      let passed:number[]=[];
      let level:unknown="new";

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
          if(active){setAccessError("Не удалось проверить доступ к уроку из-за соединения. Обнови страницу, когда связь восстановится.");setChecking(false)}
          return;
        }
        const [profileResponse,progressResponse,assessmentResponse]=responses;
        if(!profileResponse.ok||!progressResponse.ok||!assessmentResponse.ok){
          if(active){setAccessError("Не удалось проверить прогресс. Урок останется закрытым, пока проверка не завершится.");setChecking(false)}
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
  if(accessError)return <div className="lesson-gate-card locked" role="status"><div className="eyebrow">ДОСТУП НЕ ПРОВЕРЕН</div><h2>Урок временно не открыт</h2><p>{accessError} Сохранённый прогресс не изменился.</p><div><Link className="btn btn-dark" href="/platform#academy">Вернуться к учебному плану</Link></div></div>;
  if(!unlocked)return <div className="lesson-gate-card locked"><div className="eyebrow">УРОК ПОКА ЗАКРЫТ</div><h2>{lockedByAssessment?"Сначала пройди аттестацию текущего уровня":"Сначала заверши предыдущий урок"}</h2><p>{lockedByAssessment?"После успешной проверки откроется первый урок следующего уровня.":"Выполни действие, мини‑тест и проверку результата в текущем уроке — затем маршрут продолжится."}</p><div>{returnSlug?<Link className="btn btn-dark" href={"/academy/"+returnSlug}>Открыть следующий доступный урок</Link>:null}<Link className="btn btn-ghost" href="/platform#academy">Перейти к учебному плану</Link></div></div>;
  return <>{children}</>;
}
