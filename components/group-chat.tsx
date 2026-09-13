"use client";

import {FormEvent,useCallback,useEffect,useRef,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type GroupMessage={
  id:string;
  senderKind:"user"|"ai"|"moderator";
  content:string;
  createdAt:string;
  author:string;
  username:string|null;
};

export default function GroupChat({groupId,groupName}:{groupId:string;groupName:string}){
  const [messages,setMessages]=useState<GroupMessage[]>([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState("");
  const feedRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);

  const accessToken=useCallback(async()=>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    return session?.access_token||"";
  },[]);

  const load=useCallback(async(silent=false)=>{
    try{
      const access=await accessToken();
      if(!access){setNotice("Войди в аккаунт, чтобы открыть групповой чат.");return}
      const response=await fetch(`/api/social/groups/${groupId}/messages`,{headers:{Authorization:"Bearer "+access},cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Ошибка загрузки чата.");
      setMessages(data.messages||[]);
      if(!silent)setNotice("");
    }catch(reason){
      if(!silent)setNotice(reason instanceof Error?reason.message:"Ошибка загрузки чата.");
    }finally{if(!silent)setLoading(false)}
  },[accessToken,groupId]);

  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>void load(true),12000);
    return()=>window.clearInterval(timer);
  },[load]);

  useEffect(()=>{
    feedRef.current?.scrollTo({top:feedRef.current.scrollHeight,behavior:"smooth"});
  },[messages.length]);

  async function submit(event:FormEvent){
    event.preventDefault();
    const content=input.trim();
    if(!content||sending)return;
    setSending(true);setNotice("");
    try{
      const access=await accessToken();
      if(!access)throw new Error("Войди в аккаунт, чтобы отправлять сообщения.");
      const response=await fetch(`/api/social/groups/${groupId}/messages`,{
        method:"POST",
        headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},
        body:JSON.stringify({content})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Ошибка отправки сообщения.");
      setMessages(data.messages||[]);
      setInput("");
      if(inputRef.current)inputRef.current.style.height="auto";
    }catch(reason){
      setNotice(reason instanceof Error?reason.message:"Ошибка отправки сообщения.");
    }finally{setSending(false)}
  }

  return <section className="group-chat card" aria-label={`Чат группы ${groupName}`}>
    <header className="group-chat-head">
      <div><div className="eyebrow">БЕЗОПАСНЫЙ УЧЕБНЫЙ ЧАТ</div><h3>{groupName}</h3></div>
      <span>Защита сообщений</span>
    </header>
    <p className="muted">Обсуждайте монтаж и общий проект вежливо. В чате остаются сообщения по теме и без личных контактов. Напиши <b>@kivronix</b>, <b>/ai</b> или поставь «?», чтобы позвать помощника.</p>
    <div className="group-chat-feed" ref={feedRef} aria-live="polite">
      {loading?<div className="ai-thinking">Загружаю сообщения…</div>:null}
      {!loading&&!messages.length?<div className="group-chat-empty"><b>Начните с простого вопроса</b><span>Например: «@kivronix, как всей группе снять один ролик?»</span></div>:null}
      {messages.map(message=><article className={`group-message ${message.senderKind}`} key={message.id}>
        <div><b>{message.author}</b><time>{new Date(message.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</time></div>
        <p>{message.content}</p>
      </article>)}
    </div>
    {notice?<div className="auth-msg">{notice}</div>:null}
    <form className="group-chat-form" onSubmit={submit}>
      <textarea ref={inputRef} rows={2} maxLength={1400} value={input} onChange={event=>{setInput(event.target.value);const area=inputRef.current;if(area){area.style.height="auto";area.style.height=Math.min(160,area.scrollHeight)+"px"}}} placeholder="Сообщение по теме монтажа…"/>
      <button className="btn btn-lime" disabled={sending||!input.trim()}>{sending?"Проверяем…":"Отправить"}</button>
    </form>
  </section>;
}
