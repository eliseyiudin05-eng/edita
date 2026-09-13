"use client";

import {FormEvent,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

const articles=[
  ["Бриф","Как получить сравнимые работы","Дайте всем монтажёрам одинаковые исходники, цель, формат, длительность и критерии оценки. Так выбор основывается на результате, а не на разном понимании задачи."],
  ["Метрики","Что смотреть кроме просмотров","Сравнивайте удержание первых секунд, досмотры, сохранения, переходы и целевое действие. Одна метрика редко объясняет результат целиком."],
  ["Команда","Как давать правки без хаоса","Соберите комментарии в один список: обязательные исправления, идеи для следующей версии и то, что уже работает. Назначьте одного человека, который подтверждает финал."],
  ["Контент","Когда масштабировать формат","Повторяйте формат после нескольких сильных результатов, сохраняя основу и меняя начало, пример или подачу. Один удачный ролик ещё не доказывает закономерность."],
  ["Подбор","Как выбрать постоянного монтажёра","Оцените соблюдение брифа, срок, качество коммуникации и реакцию на одну содержательную правку — не только красивый первый вариант."],
  ["Креаторы","Реклама за результат","Создайте понятную кампанию: продукт, допустимые тезисы, формат интеграции и награда в KIVRONIX Points за подтверждённые просмотры."]
];

type Message={id:string;content:string;createdAt:string;author:string};

export default function BusinessInsights(){
  const [open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(false);
  async function headers(){const {data:{session}}=await getSupabaseBrowserClient().auth.getSession();return session?.access_token?{Authorization:"Bearer "+session.access_token}:{} as Record<string,string>}
  async function load(){setLoading(true);setNotice("");const r=await fetch("/api/community/business-discussion",{headers:await headers(),cache:"no-store"});const d=await r.json();setLoading(false);if(!r.ok){setNotice(d.error||"Не удалось открыть обсуждение.");return}setMessages(d.messages||[]);setOpen(true)}
  async function send(e:FormEvent){e.preventDefault();if(!draft.trim())return;setLoading(true);const r=await fetch("/api/community/business-discussion",{method:"POST",headers:{...await headers(),"Content-Type":"application/json"},body:JSON.stringify({content:draft})});const d=await r.json();setLoading(false);if(!r.ok){setNotice(d.error||"Не удалось отправить сообщение.");return}setMessages(d.messages||[]);setDraft("")}
  return <div className="insights-hub">
    <section className="insights-topic business-topic"><div><div className="eyebrow">ЗАКРЫТЫЙ КЛУБ КОМПАНИЙ</div><h2>Как находить сильных монтажёров и удерживать их в команде?</h2><p>Обсуждение доступно только владельцам бизнес-аккаунтов KIVRONIX. Сообщения монтажёров сюда не попадают.</p></div><button className="btn btn-lime" onClick={()=>void load()} disabled={loading}>{loading?"Открываем…":"Открыть обсуждение компаний"}</button></section>
    {notice?<div className="auth-msg">{notice}</div>:null}
    {open?<section className="confidential-discussion"><header><div><div className="eyebrow">ТОЛЬКО КОМПАНИИ</div><h3>Работа с видео-командой</h3></div><button className="btn btn-ghost" onClick={()=>setOpen(false)}>Закрыть</button></header><div className="discussion-privacy"><b>Конфиденциально внутри KIVRONIX</b><span>Доступ проверяется по роли аккаунта. Публичного просмотра нет.</span></div><div className="discussion-feed">{messages.length?messages.map(m=><article key={m.id}><b>{m.author}</b><p>{m.content}</p><small>{new Date(m.createdAt).toLocaleString("ru-RU")}</small></article>):<div className="discussion-empty"><b>Начните профессиональное обсуждение</b><span>Поделитесь задачей найма, брифа или организации контента.</span></div>}</div><form className="discussion-form" onSubmit={send}><textarea required maxLength={1400} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Сообщение другим компаниям без личных данных…"/><button className="btn btn-dark" disabled={loading}>Отправить</button></form></section>:null}
    <div className="insights-grid">{articles.map(([tag,title,text])=><article className="insight-card" key={title}><span>{tag}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
  </div>;
}
