"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function PayButton({product,label}:{product:"start"|"ai-pro-30";label:string}) {
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function pay(){
    setLoading(true);setError("");
    try{
      const supabase=getSupabaseBrowserClient();
      const session=supabase?(await supabase.auth.getSession()).data.session:null;
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;

      const r=await fetch("/api/payments/yookassa/create",{
        method:"POST",
        headers,
        body:JSON.stringify({product})
      });
      const data=await r.json();
      if(r.status===401){window.location.href="/login";return;}
      if(!r.ok||!data.confirmationUrl)throw new Error(data?.error||"Не удалось создать платёж");
      window.location.href=data.confirmationUrl;
    }catch(e){
      setError(e instanceof Error?e.message:"Ошибка оплаты");
      setLoading(false);
    }
  }

  return <div className="pay-action">
    <button className="btn btn-dark" onClick={pay} disabled={loading}>{loading?"Переходим к оплате…":label}</button>
    {error&&<div className="auth-msg">{error}</div>}
  </div>
}
