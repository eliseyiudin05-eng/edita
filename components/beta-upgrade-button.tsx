"use client";

import {useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function BetaUpgradeButton({className="btn btn-lime",label="Попробовать PRO бесплатно"}:{className?:string;label?:string}){
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");

  async function activate(){
    setLoading(true);setMessage("");
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token){window.location.href="/login?from=/pricing";return;}
    const response=await fetch("/api/beta/upgrade",{method:"POST",headers:{Authorization:"Bearer "+session.access_token}});
    const data=await response.json();
    setLoading(false);
    if(!response.ok){setMessage(data?.error||"Не удалось включить PRO.");return;}
    setMessage("PRO включён бесплатно до конца беты. Обновляю кабинет…");
    window.setTimeout(()=>{window.location.href="/platform"},700);
  }

  return <div className="beta-upgrade-action">
    <button type="button" className={className} onClick={activate} disabled={loading}>{loading?"Включаю…":label}</button>
    {message?<small>{message}</small>:null}
  </div>;
}
