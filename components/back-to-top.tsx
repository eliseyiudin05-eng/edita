"use client";

import {useEffect,useState} from "react";

export default function BackToTop(){
  const [visible,setVisible]=useState(false);

  useEffect(()=>{
    const update=()=>setVisible(window.scrollY>520);
    update();
    window.addEventListener("scroll",update,{passive:true});
    return()=>window.removeEventListener("scroll",update);
  },[]);

  return <button
    type="button"
    className={"back-to-top "+(visible?"visible":"")}
    aria-label="Вернуться в начало страницы"
    title="Наверх"
    onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}
  >↑<span>Наверх</span></button>;
}
