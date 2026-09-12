"use client";

import {useEffect} from "react";
import {useParams} from "next/navigation";

export default function ReferralLanding(){
  const params=useParams<{code:string}>();
  useEffect(()=>{
    const code=String(params?.code||"").toUpperCase();
    if(code)localStorage.setItem("edita_referral_code",code);
    const timer=window.setTimeout(()=>{window.location.href="/signup/editor?ref="+encodeURIComponent(code)},250);
    return()=>window.clearTimeout(timer);
  },[params]);
  return <main className="prelaunch-page"><section className="prelaunch-card"><div className="brand">EDITA<span>.</span></div><div className="eyebrow">ПРИГЛАШЕНИЕ ОТ ДРУГА</div><h1>Открываем регистрацию…</h1><p>После первого пройденного урока ты и друг получите баллы EDITA.</p></section></main>
}
