"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {getFreshAccessToken} from "@/lib/supabase-browser";

const hints:Record<string,string>={
  "Adobe Premiere Pro":"Ищи панели Project, Source, Program и Timeline. Инструмент разрезания — Razor, экспорт — Export Media.",
  "DaVinci Resolve":"Основная сборка находится на страницах Cut и Edit. Файлы — в Media Pool, готовый файл — на странице Deliver.",
  "Final Cut Pro":"Исходники находятся в Browser, монтаж — в Magnetic Timeline, готовый файл создаётся через Share.",
  "VN":"Новый проект открывает мобильную ленту монтажа. Разрезание называется «Разделить», сохранение — «Экспорт».",
  "InShot":"Добавь исходники через «Видео», редактируй выбранный клип на нижней панели и сохраняй кнопкой в правом верхнем углу.",
  "CapCut":"Следуй названиям из урока. На телефоне инструменты находятся снизу, на компьютере — вокруг ленты монтажа.",
};

export default function LessonSoftwareAdapter({lessonSoftware}:{lessonSoftware:string}){
 const [software,setSoftware]=useState("");
 useEffect(()=>{void(async()=>{const token=await getFreshAccessToken();if(!token)return;const response=await fetch("/api/profile/learning-preferences",{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(response.ok){const data=await response.json();setSoftware(String(data.preferences?.software||""))}})()},[]);
 if(!software)return null;
 const hint=hints[software]||`Интерфейс ${software} может отличаться от примера, но логика остаётся той же: файлы → лента монтажа → просмотр → экспорт.`;
 return <section className="software-adapter"><div><div className="eyebrow">АДАПТАЦИЯ ПОД ТВОЮ ПРОГРАММУ</div><h2>{software}</h2><p>{hint}</p><small>Пример урока: {lessonSoftware}. Помощник уже учитывает выбранную программу и подскажет точное название кнопки.</small></div><Link className="btn btn-ghost" href="/onboarding">Изменить программу</Link></section>
}
