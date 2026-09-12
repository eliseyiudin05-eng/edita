"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function LessonRouteGate({requiredSlugs,previousSlug,children}:{requiredSlugs:string[];previousSlug?:string|null;children:React.ReactNode}){
  const [checking,setChecking]=useState(true);
  const [unlocked,setUnlocked]=useState(requiredSlugs.length===0);

  useEffect(()=>{
    let active=true;
    async function check(){
      let completed:string[]=[];
      try{
        const saved=JSON.parse(localStorage.getItem("edita_lesson_done")||"[]");
        if(Array.isArray(saved))completed=saved.filter((item):item is string=>typeof item==="string");
      }catch{}

      const supabase=getSupabaseBrowserClient();
      const {data:{user}}=await supabase.auth.getUser();
      if(user){
        const {data}=await supabase.from("lesson_progress")
          .select("status,lessons!inner(slug)")
          .eq("user_id",user.id)
          .eq("status","completed");
        const fromAccount=(data||[]).map((row:any)=>row.lessons?.slug).filter((slug:any)=>typeof slug==="string");
        completed=fromAccount;
        try{localStorage.setItem("edita_lesson_done",JSON.stringify(completed))}catch{}
      }

      if(active){setUnlocked(requiredSlugs.every(slug=>completed.includes(slug)));setChecking(false)}
    }
    void check();
    return()=>{active=false};
  },[requiredSlugs]);

  if(checking)return <div className="lesson-gate-card"><b>Проверяем прогресс…</b></div>;
  if(!unlocked)return <div className="lesson-gate-card locked"><div className="eyebrow">УРОК ПОКА ЗАКРЫТ</div><h2>Сначала выполни предыдущее задание</h2><p>Уроки открываются по порядку, чтобы сложные инструменты не появились раньше основы.</p><div>{previousSlug?<Link className="btn btn-dark" href={"/academy/"+previousSlug}>Вернуться к предыдущему уроку</Link>:null}<Link className="btn btn-ghost" href="/platform#academy">Открыть маршрут</Link></div></div>;
  return <>{children}</>;
}
