"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function LessonProgressButton({slug,xp,nextSlug}:{slug:string;xp:number;nextSlug?:string|null}){
  const [done,setDone]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const saved=JSON.parse(localStorage.getItem("edita_lesson_done")||"[]");
        if(Array.isArray(saved)&&saved.includes(slug)&&active)setDone(true);
      }catch{}
      const supabase=getSupabaseBrowserClient();
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return;
      const {data}=await supabase.from("lesson_progress")
        .select("status,lessons!inner(slug)")
        .eq("user_id",user.id)
        .eq("status","completed")
        .eq("lessons.slug",slug)
        .maybeSingle();
      if(active)setDone(Boolean(data));
    }
    void load();
    return()=>{active=false};
  },[slug]);

  async function complete(){
    if(saving||done||!confirmed)return;
    setSaving(true);setNotice("");
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      if(session?.access_token){
        const response=await fetch("/api/lessons/progress",{
          method:"POST",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
          body:JSON.stringify({slug,completed:true,taskConfirmed:true,submissionNote:note})
        });
        const data=await response.json();
        if(!response.ok)throw new Error(data?.error||"Не удалось сохранить прогресс.");
        void fetch("/api/referral/qualify",{method:"POST",headers:{Authorization:"Bearer "+session.access_token}}).catch(()=>{});
      }

      const saved=JSON.parse(localStorage.getItem("edita_lesson_done")||"[]");
      const values=Array.isArray(saved)?saved.filter((item):item is string=>typeof item==="string"):[];
      localStorage.setItem("edita_lesson_done",JSON.stringify(Array.from(new Set([...values,slug]))));
      setDone(true);
      setNotice("Задание принято. Следующий урок открыт.");
      window.dispatchEvent(new CustomEvent("edita:lesson-completed",{detail:{slug}}));
    }catch(error){
      setNotice(error instanceof Error?error.message:"Не удалось сохранить задание.");
    }finally{setSaving(false)}
  }

  return <div className="lesson-progress-action">
    {!done?<>
      <label className="task-confirm-row"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>Я выполнил задание и проверил результат по чек-листу.</span></label>
      <textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={1000} rows={2} placeholder="Необязательно: что получилось или где было сложно"/>
      <button className="btn btn-lime" type="button" onClick={complete} disabled={saving||!confirmed}>{saving?"Сохраняю…":"Сдать задание · +"+xp+" XP"}</button>
    </>:<div className="lesson-complete-box"><b>Задание выполнено</b><span>Прогресс сохранён, следующий урок открыт.</span>{nextSlug?<Link className="btn btn-dark" href={"/academy/"+nextSlug}>Перейти к следующему уроку →</Link>:<Link className="btn btn-dark" href="/platform#academy">Вернуться в Академию</Link>}</div>}
    {notice?<small>{notice}</small>:null}
  </div>;
}
