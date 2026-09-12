"use client";

import Link from "next/link";
import {useEffect,useState} from "react";

export default function CookieNotice(){
  const [show,setShow]=useState(false);
  useEffect(()=>{
    try{if(!localStorage.getItem("edita_cookie_notice_v1"))setShow(true)}catch{}
  },[]);
  if(!show)return null;
  function close(){
    try{localStorage.setItem("edita_cookie_notice_v1","seen")}catch{}
    setShow(false);
  }
  return <div className="cookie-notice" role="dialog" aria-label="Информация о cookie">
    <div>
      <b>Файлы cookie</b>
      <span>EDITA использует только нужные для работы файлы cookie: для входа и безопасности. Рекламные cookie отсутствуют.</span>
    </div>
    <div className="cookie-actions"><Link href="/cookies">Подробнее</Link><button className="btn btn-dark" onClick={close}>Понятно</button></div>
  </div>
}
