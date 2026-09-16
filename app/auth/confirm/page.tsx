"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import type {EmailOtpType} from "@supabase/supabase-js";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

export default function ConfirmEmailPage(){
  const [state,setState]=useState<"loading"|"error">("loading");
  const [message,setMessage]=useState("Подтверждаем почту и открываем личный кабинет…");

  useEffect(()=>{
    let active=true;
    async function confirm(){
      const params=new URLSearchParams(window.location.search);
      const tokenHash=params.get("token_hash");
      const type=(params.get("type")||"signup") as EmailOtpType;
      if(!tokenHash){if(active){setState("error");setMessage("В ссылке нет кода подтверждения.")}return;}
      const supabase=getSupabaseBrowserClient();
      const {data,error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type});
      if(!active)return;
      if(error||!data.session){setState("error");setMessage("Ссылка уже использована или устарела. Запроси новое письмо со страницы входа.");return;}
      window.location.replace("/platform#home");
    }
    void confirm();
    return()=>{active=false};
  },[]);

  return <main className="auth-wrap"><section className="auth-card auth-confirm-card">
    <div className="auth-confirm-orb" aria-hidden="true">{state==="loading"?"✦":"!"}</div>
    <div className="eyebrow">KIVRONIX</div><h1>{state==="loading"?"Почти готово":"Не удалось подтвердить почту"}</h1><p>{message}</p>
    {state==="error"?<div className="lesson-actions"><Link className="btn btn-dark" href="/login">Перейти ко входу</Link><Link className="btn btn-ghost" href="/signup">Создать аккаунт</Link></div>:null}
  </section></main>;
}
