"use client";
import {useEffect,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";
export default function EditorProgressDashboard({xp,completed,total,aiScore}:{xp:number;completed:number;total:number;aiScore?:number|null}){
 const [position,setPosition]=useState<number|null>(null),[totalEditors,setTotalEditors]=useState(0);
 useEffect(()=>{void(async()=>{try{const token=await getFreshAccessToken();const response=await fetch("/api/social/ranking",{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(!response.ok)return;const data=await response.json();const rows=data.ranking||data.rows||[];setTotalEditors(rows.length);const index=rows.findIndex((row:any)=>row.viewer||row.isViewer);if(index>=0)setPosition(index+1)}catch{}})()},[]);
 const progress=Math.round(completed/Math.max(1,total)*100);
 return <section className="editor-progress-panel"><div><div className="eyebrow">АНАЛИТИКА РОСТА</div><h2>Твой прогресс виден в цифрах</h2><p>Рейтинг растёт от практики, качества работ и подтверждённых результатов — не от покупки баллов.</p></div><div className="editor-progress-metrics"><article><span>Место</span><strong>{position?`№ ${position}`:"—"}</strong><small>{totalEditors?`из ${totalEditors} монтажёров`:"рейтинг загружается"}</small></article><article><span>Обучение</span><strong>{progress}%</strong><small>{completed} из {total} уроков</small></article><article><span>Опыт</span><strong>{xp}</strong><small>за завершённые уроки</small></article><article><span>ИИ‑оценка</span><strong>{aiScore??"—"}</strong><small>лучший подтверждённый результат</small></article></div></section>
}
