"use client";

import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import {curriculum,learningStartIndex} from "@/lib/curriculum";

export default function LessonRouteGate({requiredSlugs,previousSlug,children}:{requiredSlugs:string[];previousSlug?:string|null;children:React.ReactNode}){
  const router=useRouter();
  const pathname=usePathname();
  const [checking,setChecking]=useState(true);
  const [unlocked,setUnlocked]=useState(false);

  useEffect(()=>{
    let active=true;
    async function check(){
      let completed:string[]=[];
      try{
        const saved=JSON.parse(localStorage.getItem("kivronix_lesson_done")||"[]");
        if(Array.isArray(saved))completed=saved.filter((item):item is string=>typeof item==="string");
      }catch{}

      const supabase=getSupabaseBrowserClient();
      const [{data:{user}},{data:{session}}]=await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      if(!user){
        router.replace("/login?from="+encodeURIComponent(pathname));
        return;
      }
      if(user){
        if(!session?.access_token){
          router.replace("/login?from="+encodeURIComponent(pathname));
          return;
        }
        const headers={Authorization:"Bearer "+session.access_token};
        const responses=await Promise.all([
          fetch("/api/profile/learning-preferences",{headers,cache:"no-store"}),
          fetch("/api/lessons/progress",{headers,cache:"no-store"}),
        ]).catch(()=>null);
        if(!responses){
          if(active)setChecking(false);
          return;
        }
        const [profileResponse,progressResponse]=responses;
        if(!profileResponse.ok||!progressResponse.ok){
          if(active)setChecking(false);
          return;
        }
        const [profile,progress]=await Promise.all([profileResponse.json(),progressResponse.json()]);
        const fromAccount=Array.isArray(progress?.completedSlugs)?progress.completedSlugs.filter((slug:unknown):slug is string=>typeof slug==="string"):[];
        completed=fromAccount;
        const startIndex=learningStartIndex(profile?.preferences?.level);
        const currentIndex=curriculum.findIndex(item=>item.slug===pathname.split("/").pop());
        const requiredForLevel=currentIndex>=0?curriculum.slice(startIndex,currentIndex).map(item=>item.slug):requiredSlugs;
        if(active){setUnlocked(currentIndex<=startIndex||requiredForLevel.every(slug=>completed.includes(slug)));setChecking(false)}
        try{localStorage.setItem("kivronix_lesson_done",JSON.stringify(completed))}catch{}
        return;
      }

      if(active){setUnlocked(requiredSlugs.every(slug=>completed.includes(slug)));setChecking(false)}
    }
    void check();
    return()=>{active=false};
  },[pathname,requiredSlugs,router]);

  if(checking)return <div className="lesson-gate-card"><b>Проверяем вход и прогресс…</b></div>;
  if(!unlocked)return <div className="lesson-gate-card locked"><div className="eyebrow">УРОК ПОКА ЗАКРЫТ</div><h2>Сначала заверши предыдущий урок</h2><p>Уроки открываются по порядку: основа всегда идёт раньше сложных инструментов.</p><div>{previousSlug?<Link className="btn btn-dark" href={"/academy/"+previousSlug}>Вернуться к предыдущему уроку</Link>:null}<Link className="btn btn-ghost" href="/platform#academy">Открыть маршрут</Link></div></div>;
  return <>{children}</>;
}
