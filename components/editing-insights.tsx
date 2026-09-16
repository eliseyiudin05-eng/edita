"use client";

import {FormEvent,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

const articles=[
  {tag:"Практическая статья",title:"Почему сначала режут паузы",lead:"Чистый темп почти всегда делает ролик сильнее раньше, чем эффекты.",body:"Посмотри ролик без музыки и отметь места, где мысль уже закончилась, а следующий кадр ещё не начался. На первом проходе убери только очевидную пустоту. На втором сравни соседние фразы: зрителю должно хватать времени понять смысл, но ожидание следующей мысли не должно ощущаться случайным. После этого верни звук и проверь дыхание, окончания слов и естественность речи.\n\nРаботай тремя версиями: исходной, плотной и промежуточной. Посмотри их на обычной скорости и выбери ту, где смысл сохраняется без ощущения спешки. Эффекты добавляй после решения темпа — тогда каждый из них поддерживает историю, а не скрывает слабую склейку."},
  {tag:"Кино",title:"Что делает монтажёр в кино",lead:"Он собирает не просто красивые кадры, а настроение, время и внимание зрителя.",body:"Одна сцена может быть снята много раз и с разных точек. Монтажёр выбирает удачные дубли, управляет длительностью взглядов и пауз, а затем соединяет сцену так, чтобы зритель чувствовал нужную эмоцию."},
  {tag:"Факт",title:"Склейку можно спрятать звуком",lead:"Ухо часто принимает переход раньше, чем глаз замечает новый кадр.",body:"Если звук следующего кадра начинается немного раньше изображения, переход ощущается мягче. Если старый звук продолжается поверх нового кадра, сцена тоже связывается естественнее."},
  {tag:"Работа",title:"Почему клиенту важны названия файлов",lead:"Порядок в версиях экономит время и защищает от случайной отправки старого ролика.",body:"Называй файлы понятно: бренд_тема_v01, v02 и final только после подтверждения. Храни исходники, проект и готовые версии в отдельных папках."},
  {tag:"Короткие видео",title:"Один ролик — одна главная мысль",lead:"Когда идей слишком много, зрителю сложнее понять, зачем смотреть дальше.",body:"Перед монтажом закончи фразу: «После этого ролика человек поймёт…». Всё, что не помогает этой цели, перенеси в следующий ролик или сократи."},
  {tag:"Насмотренность",title:"Как смотреть ролики как монтажёр",lead:"Не просто оценивай «нравится», а замечай конкретные решения.",body:"Останови ролик после пяти секунд и запиши: какой был первый кадр, когда появилась музыка, где поменялся план и почему захотелось смотреть дальше. Так чужая работа превращается в понятный учебный пример."}
];

const weeklyTopics=[
  ["Монтажёр в кино: автор или человек за компьютером?","Разбери, как порядок кадров меняет историю, актёрскую игру и эмоцию зрителя."],
  ["Почему зритель решает всё в первые секунды?","Сравни три начала ролика и найди момент, в котором появляется ясная причина смотреть дальше."],
  ["Звук, который делает склейку незаметной","Обсуди J-cut и L-cut: когда следующий звук начинается раньше кадра и когда прошлый продолжается поверх нового."],
  ["Как давать себе правки без бесконечного перемонтажа","Собери критерии готовности и отдели обязательные исправления от новых идей."]
];

type DiscussionMessage={id:string;content:string;createdAt:string;author:string;username?:string|null};

export default function EditingInsights(){
  const [opened,setOpened]=useState<number|null>(null);
  const [discussionOpen,setDiscussionOpen]=useState(false);
  const [messages,setMessages]=useState<DiscussionMessage[]>([]);
  const [draft,setDraft]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(false);
  const topic=weeklyTopics[Math.floor(Date.now()/604800000)%weeklyTopics.length];

  async function authHeaders():Promise<Record<string,string>>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token?{Authorization:"Bearer "+session.access_token}:{};
  }

  async function openDiscussion(){
    setLoading(true);setNotice("");
    const headers=await authHeaders();
    const response=await fetch("/api/community/discussion",{headers,cache:"no-store"});
    const data=await response.json();
    setLoading(false);
    if(!response.ok){setNotice(data?.error||"Не удалось открыть обсуждение.");return;}
    setMessages(data.messages||[]);
    setDiscussionOpen(true);
  }

  async function sendMessage(event:FormEvent){
    event.preventDefault();
    if(!draft.trim())return;
    setLoading(true);setNotice("");
    const headers=await authHeaders();
    const response=await fetch("/api/community/discussion",{
      method:"POST",
      headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({content:draft})
    });
    const data=await response.json();
    setLoading(false);
    if(!response.ok){setNotice(data?.error||"Не удалось отправить сообщение.");return;}
    setMessages(data.messages||[]);
    setDraft("");
  }

  return <div className="insights-hub">
    <section className="insights-topic"><div><div className="eyebrow">ТЕМА НЕДЕЛИ · ОБНОВЛЯЕТСЯ КАЖДЫЕ 7 ДНЕЙ</div><h2>{topic[0]}</h2><p>{topic[1]}</p><span className="privacy-note">Закрытое пространство: сообщения доступны только вошедшим участникам обсуждения.</span></div><button className="btn btn-lime" onClick={()=>void openDiscussion()} disabled={loading}>{loading?"Открываем…":"Перейти к обсуждению"}</button></section>
    {notice?<div className="auth-msg">{notice}</div>:null}
    {discussionOpen?<section className="confidential-discussion">
      <header><div><div className="eyebrow">ЗАКРЫТОЕ ОБСУЖДЕНИЕ</div><h3>Монтажёр в кино</h3></div><button type="button" className="btn btn-ghost" onClick={()=>setDiscussionOpen(false)}>Закрыть</button></header>
      <div className="discussion-privacy"><b>Конфиденциально внутри KIVRONIX</b><span>Обсуждение не показывается на публичных страницах и недоступно без входа.</span></div>
      <div className="discussion-feed">{messages.length?messages.map(message=><article key={message.id}><b>{message.author}</b><p>{message.content}</p><small>{new Date(message.createdAt).toLocaleString("ru-RU")}</small></article>):<div className="discussion-empty"><b>Начни обсуждение</b><span>Напиши, какую роль, по-твоему, играет монтажёр в создании фильма.</span></div>}</div>
      <form className="discussion-form" onSubmit={sendMessage}><textarea maxLength={1400} required placeholder="Напиши своё мнение без личных данных…" value={draft} onChange={event=>setDraft(event.target.value)}/><button className="btn btn-dark" disabled={loading}>{loading?"Отправляем…":"Отправить"}</button></form>
    </section>:null}
    <div className="insights-grid">{articles.map((article,index)=><article className={"insight-card "+(opened===index?"article-paper":"")} key={article.title}><span>{article.tag}</span><h3>{article.title}</h3><p>{article.lead}</p>{opened===index?<div className="insight-body">{article.body.split("\n\n").map(paragraph=><p key={paragraph}>{paragraph}</p>)}</div>:null}<button className="insight-toggle" onClick={()=>setOpened(opened===index?null:index)}>{opened===index?"Свернуть":"Открыть подробную статью →"}</button></article>)}</div>
  </div>;
}
