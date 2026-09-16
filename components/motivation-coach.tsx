"use client";

import {useEffect,useMemo,useState} from "react";

const messages=[
  ["Не останавливайся — ты уже ближе, чем вчера.","Открой один небольшой шаг и закончи только его."],
  ["Ты молодец: прогресс складывается из повторений.","Даже десять минут монтажа сегодня укрепляют навык."],
  ["Сильный ролик редко получается с первой версии.","Одна точная правка важнее десяти случайных эффектов."],
  ["Твой стиль появляется, когда ты продолжаешь.","Сравни новую работу с предыдущей, а не с чужим финалом."],
  ["Ты уже начал — сохрани темп.","Следующий уверенный шаг важнее идеального плана."]
];

export default function MotivationCoach({xp=0,compact=false}:{xp?:number;compact?:boolean}){
  const initial=useMemo(()=>Math.floor(xp/50)%messages.length,[xp]);
  const [index,setIndex]=useState(initial);
  useEffect(()=>{const timer=window.setInterval(()=>setIndex(value=>(value+1)%messages.length),12000);return()=>window.clearInterval(timer)},[]);
  const [title,detail]=messages[index];
  return <aside className={"motivation-coach "+(compact?"compact":"")} aria-live="polite"><span className="motivation-spark">✦</span><div><small>НАСТАВНИК KIVRONIX</small><b>{title}</b><p>{detail}</p></div><button type="button" onClick={()=>setIndex(value=>(value+1)%messages.length)} aria-label="Следующая подсказка">→</button></aside>;
}
