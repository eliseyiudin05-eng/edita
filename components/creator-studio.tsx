"use client";

import Link from "next/link";
import {useEffect,useState} from "react";

const week=["Выбрать идею и хук","Снять исходники","Передать монтажёру","Проверить и опубликовать"];

export default function CreatorStudio({onGo}:{onGo:(tab:"portfolio"|"jobs"|"messages"|"talent")=>void}){
  const [done,setDone]=useState<string[]>([]);
  useEffect(()=>{try{setDone(JSON.parse(localStorage.getItem("kivronix_creator_week")||"[]"))}catch{}},[]);
  function toggle(item:string){setDone(current=>{const next=current.includes(item)?current.filter(value=>value!==item):[...current,item];try{localStorage.setItem("kivronix_creator_week",JSON.stringify(next))}catch{}return next})}
  const percent=Math.round(done.length/week.length*100);
  return <div className="creator-studio">
    <section className="creator-studio-grid"><article className="card creator-week"><div className="eyebrow">ПЛАН КОНТЕНТА НА НЕДЕЛЮ</div><div className="creator-week-head"><h3>{done.length} из {week.length} шагов готовы</h3><strong>{percent}%</strong></div><div className="creator-week-track"><span style={{width:percent+"%"}}/></div>{week.map((item,index)=><label key={item}><b>{String(index+1).padStart(2,"0")}</b><input type="checkbox" checked={done.includes(item)} onChange={()=>toggle(item)}/><span>{item}</span></label>)}</article><article className="card creator-opportunity"><div className="eyebrow">СНИМИ ПРО KIVRONIX</div><h3>Получи награду за честный ролик о платформе</h3><p>Выбери готовый рекламный бриф, покажи реальный сценарий использования и отправь ссылку на публикацию для проверки.</p><Link className="btn btn-lime" href="/creators">Открыть брифы</Link></article></section>
    <section className="creator-tool-grid"><button onClick={()=>onGo("talent")}><b>Найти монтажёра</b><span>Сравнить рейтинг, уровень и портфолио</span></button><button onClick={()=>onGo("jobs")}><b>Создать постоянное задание</b><span>Отклики остаются открытыми до твоего выбора</span></button><button onClick={()=>onGo("portfolio")}><b>Изучить форматы</b><span>Сохранить идеи из ленты KIVRONIX Video</span></button><button onClick={()=>onGo("messages")}><b>Проверить работу</b><span>Правки и файлы в закрытом чате</span></button></section>
  </div>;
}
