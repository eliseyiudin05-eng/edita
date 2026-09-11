"use client";

import { useState } from "react";

export default function PayButton({
  product,
  label,
}: {
  product: "start" | "ai-pro-30";
  label: string;
}) {
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function pay(){
    setLoading(true);
    setError("");
    try{
      const r=await fetch("/api/payments/yookassa/create",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({product})
      });
      const data=await r.json();
      if(!r.ok||!data.confirmationUrl){
        throw new Error(data?.error||"Не удалось создать платёж");
      }
      window.location.href=data.confirmationUrl;
    }catch(e){
      setError(e instanceof Error?e.message:"Ошибка оплаты");
      setLoading(false);
    }
  }

  return <div className="pay-action">
    <button className="btn btn-dark" onClick={pay} disabled={loading}>
      {loading?"Переходим к оплате…":label}
    </button>
    {error&&<div className="auth-msg">{error}</div>}
  </div>
}
