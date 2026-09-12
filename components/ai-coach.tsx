"use client";

import {FormEvent,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
import type {AiChatMessage} from "@/lib/ai-history";

type CoachContext={
  level?:string;
  editor?:string;
  goal?:string;
  role?:string|null;
  xp?:number;
  completedLessons?:string[];
  lessonSlug?:string;
  lessonTitle?:string;
  lessonSummary?:string;
  lessonSteps?:string[];
};

type AiCoachProps={
  scopeKey:string;
  title?:string;
  welcome?:string;
  prompts?:string[];
  context?:CoachContext;
  compact?:boolean;
};

const defaultWelcome="Привет! Спроси обычными словами. Я объясню коротко, покажу шаги и скажу, как проверить результат.";

export default function AiCoach({scopeKey,title="AI Помощник",welcome=defaultWelcome,prompts=[],context={},compact=false}:AiCoachProps){
  const localKey=useMemo(()=>"edita_ai_chat_v1:"+scopeKey,[scopeKey]);
  const [messages,setMessages]=useState<AiChatMessage[]>([{from:"ai",text:welcome}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [historyLoading,setHistoryLoading]=useState(true);
  const [storageMode,setStorageMode]=useState<"account"|"browser">("browser");
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token){
          const params=new URLSearchParams({scope:scopeKey,title});
          const response=await fetch("/api/ai/history?"+params,{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
          if(response.ok){
            const data=await response.json();
            if(active){
              setStorageMode("account");
              setMessages(data.messages?.length?data.messages:[{from:"ai",text:welcome}]);
            }
            return;
          }
        }
        const raw=localStorage.getItem(localKey);
        const saved=raw?JSON.parse(raw):null;
        if(active&&Array.isArray(saved)&&saved.length)setMessages(saved.slice(-80));
      }catch{}
      finally{if(active)setHistoryLoading(false)}
    }
    void load();
    return()=>{active=false};
  },[localKey,scopeKey,title,welcome]);

  useEffect(()=>{
    if(historyLoading||storageMode!=="browser")return;
    try{localStorage.setItem(localKey,JSON.stringify(messages.slice(-80)))}catch{}
  },[historyLoading,localKey,messages,storageMode]);

  async function send(text:string){
    const question=text.trim();
    if(!question||loading)return;
    const next=[...messages,{from:"user" as const,text:question}];
    setMessages(next);setInput("");setLoading(true);setNotice("");
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
      const response=await fetch("/api/ai",{
        method:"POST",
        headers,
        body:JSON.stringify({
          message:question,
          context:{...context,scopeKey},
          history:messages.slice(-12)
        })
      });
      const data=await response.json();
      const reply=data.reply||"Не получилось ответить. Попробуй ещё раз чуть позже.";
      setMessages(current=>[...current,{from:"ai",text:reply}]);
      if(data.saved)setStorageMode("account");
    }catch{
      setMessages(current=>[...current,{from:"ai",text:"Связь прервалась. Вопрос не потерян — нажми «Спросить» ещё раз, когда интернет восстановится."}]);
    }finally{setLoading(false)}
  }

  async function submit(event:FormEvent){event.preventDefault();await send(input)}

  async function clear(){
    setNotice("");
    try{
      if(storageMode==="account"){
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token){
          await fetch("/api/ai/history?scope="+encodeURIComponent(scopeKey),{method:"DELETE",headers:{Authorization:"Bearer "+session.access_token}});
        }
      }else localStorage.removeItem(localKey);
      setMessages([{from:"ai",text:welcome}]);
      setNotice("История очищена.");
    }catch{setNotice("Не удалось очистить историю.")}
  }

  return <section className={"ai-coach "+(compact?"compact":"")} aria-label={title}>
    <div className="ai-coach-head">
      <div><span className="ai-orb" aria-hidden="true">AI</span><div><b>{title}</b><small>{storageMode==="account"?"Диалог сохраняется в аккаунте":"Диалог сохраняется в этом браузере"}</small></div></div>
      <button type="button" className="ai-clear" onClick={clear}>Очистить</button>
    </div>
    <div className="ai-feed" aria-live="polite">
      {historyLoading?<div className="ai-thinking">Загружаю диалог…</div>:messages.map((message,index)=><article className={"ai-message "+message.from} key={message.id||index}>
        <span>{message.from==="ai"?"EDITA AI":"Ты"}</span>
        <AiMessageText text={message.text}/>
      </article>)}
      {loading?<div className="ai-thinking">Разбираю вопрос и готовлю шаги…</div>:null}
    </div>
    {prompts.length?<div className="ai-prompts">{prompts.slice(0,4).map(prompt=><button type="button" key={prompt} onClick={()=>void send(prompt)} disabled={loading}>{prompt}</button>)}</div>:null}
    <form className="ai-form" onSubmit={submit}>
      <textarea value={input} onChange={event=>setInput(event.target.value)} maxLength={4000} rows={compact?2:3} placeholder="Например: я не вижу кнопку «Разделить». Что нажать?"/>
      <button className="btn btn-lime" disabled={loading||!input.trim()}>{loading?"Думаю…":"Спросить AI"}</button>
    </form>
    {notice?<div className="ai-notice">{notice}</div>:null}
    <small className="ai-disclaimer">Кнопки в приложениях иногда переезжают после обновлений. AI уточнит устройство и версию, если это важно.</small>
  </section>
}

function AiMessageText({text}:{text:string}){
  const lines=text.replace(/\r/g,"").split("\n").filter((line,index,all)=>line.trim()||all[index-1]?.trim());
  return <div className="ai-message-text">{lines.map((raw,index)=>{
    const line=raw.trim().replace(/^#{1,4}\s*/,"").replace(/^\*\*(.*?)\*\*:?$/,"$1");
    if(!line)return <span className="ai-space" key={index}/>;
    if(/^\d+[.)]\s/.test(line))return <div className="ai-numbered" key={index}><b>{line.match(/^\d+/)?.[0]}</b><p>{line.replace(/^\d+[.)]\s*/,"")}</p></div>;
    if(/^[-•]\s/.test(line))return <div className="ai-bullet" key={index}><b>•</b><p>{line.replace(/^[-•]\s*/,"")}</p></div>;
    if(/^(Что это|Что сделать|Как проверить|Лайфхак|Куда нажать|Следующий шаг)[:：]?$/.test(line))return <h4 key={index}>{line.replace(/[:：]$/,"")}</h4>;
    return <p key={index}>{line.replace(/\*\*/g,"")}</p>;
  })}</div>
}
