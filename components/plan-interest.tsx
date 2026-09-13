"use client";

import {useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import type {FuturePlanId,PlanAudience} from "@/lib/plans";

export default function PlanInterest({audience,plan}:{audience:PlanAudience;plan:FuturePlanId}){
  const [state,setState]=useState<"idle"|"loading"|"saved">("idle");
  const [message,setMessage]=useState("");

  async function join(){
    setState("loading");setMessage("");
    const supabase=getSupabaseBrowserClient();
    if(!supabase){
      window.location.assign(audience==="business"?"/signup/business":"/signup/editor");
      return;
    }
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token){
      window.location.assign((audience==="business"?"/signup/business":"/signup/editor")+"?next=/pricing");
      return;
    }
    try{
      const response=await fetch("/api/plans/interest",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
        body:JSON.stringify({audience,plan})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Не удалось сохранить интерес.");
      setState("saved");
      setMessage("Готово. Сообщим в кабинете, когда тариф можно будет подключить.");
    }catch(error){
      setState("idle");
      setMessage(error instanceof Error?error.message:"Попробуйте ещё раз.");
    }
  }

  return <div className="beta-upgrade-action">
    <button className="btn btn-dark" type="button" onClick={join} disabled={state!=="idle"}>
      {state==="loading"?"Сохраняем…":state==="saved"?"Интерес сохранён":"Узнать о запуске"}
    </button>
    {message?<small className="muted" role="status">{message}</small>:null}
  </div>;
}
