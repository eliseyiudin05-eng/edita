"use client";

import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function LessonProgressButton({slug,xp}:{slug:string;xp:number}){
  const [done,setDone]=useState(false);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("edita_lesson_done")||"[]");
      setDone(Array.isArray(saved)&&saved.includes(slug));
    }catch{}
  },[slug]);

  async function toggle(){
    if(saving)return;
    setSaving(true);setNotice("");
    const nextDone=!done;
    setDone(nextDone);
    try{
      const saved=JSON.parse(localStorage.getItem("edita_lesson_done")||"[]");
      const values=Array.isArray(saved)?saved.filter((item):item is string=>typeof item==="string"):[];
      const next=nextDone?Array.from(new Set([...values,slug])):values.filter(item=>item!==slug);
      localStorage.setItem("edita_lesson_done",JSON.stringify(next));

      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token){setNotice("Сохранено на этом устройстве. Войди, чтобы видеть прогресс везде.");return}
      const response=await fetch("/api/lessons/progress",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({slug,completed:nextDone})
      });
      if(!response.ok)throw new Error("progress sync failed");
      setNotice(nextDone?"Готово — прогресс сохранён в аккаунте.":"Отметка снята.");
    }catch{
      setNotice("На устройстве сохранено, но синхронизация не удалась.");
    }finally{setSaving(false)}
  }

  return <div className="lesson-progress-action">
    <button className={"btn "+(done?"btn-ghost":"btn-lime")} type="button" onClick={toggle} disabled={saving}>
      {saving?"Сохраняю…":done?"✓ Урок пройден":"Завершить урок · +"+xp+" XP"}
    </button>
    {notice?<small>{notice}</small>:null}
  </div>
}
