"use client";

import {FormEvent,useEffect,useRef,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Msg={from:"client"|"user";text:string};
type Result={client_reply:string;score:number;feedback:string;better_answer:string};

export default function ClientSimulator(){
  const [scenario,setScenario]=useState("Клиент хочет ролик длиной 30 секунд за 1 500 ₽ вместо предложенных 3 000 ₽ и просит любое число правок.");
  const [messages,setMessages]=useState<Msg[]>([{from:"client",text:"Мне нравится, но 3 000 дорого. Давай за 1 500 и если что потом ещё поправим?"}]);
  const [input,setInput]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [loading,setLoading]=useState(false);
  const [ready,setReady]=useState(false);
  const [storageMode,setStorageMode]=useState<"account"|"browser">("browser");
  const chatRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{
    let active=true;
    async function load(){
      try{
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token){
          const response=await fetch("/api/practice/session",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
          const data=await response.json();
          if(response.ok&&active){
            setStorageMode("account");
            if(data.session){
              if(data.session.scenario)setScenario(data.session.scenario);
              if(Array.isArray(data.session.messages)&&data.session.messages.length)setMessages(data.session.messages);
              if(data.session.result)setResult(data.session.result);
            }
            setReady(true);
            return;
          }
        }
        const saved=JSON.parse(localStorage.getItem("edita_practice_simulator_v1")||"null");
        if(active&&saved){
          if(typeof saved.scenario==="string")setScenario(saved.scenario);
          if(Array.isArray(saved.messages)&&saved.messages.length)setMessages(saved.messages);
          if(saved.result&&typeof saved.result==="object")setResult(saved.result);
        }
      }catch{}finally{if(active)setReady(true)}
    }
    void load();
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    if(!ready)return;
    const snapshot={scenario,messages:messages.slice(-50),result};
    try{localStorage.setItem("edita_practice_simulator_v1",JSON.stringify(snapshot))}catch{}
    if(storageMode!=="account")return;
    const timer=window.setTimeout(async()=>{
      try{
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token)await fetch("/api/practice/session",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify(snapshot)});
      }catch{}
    },600);
    return()=>window.clearTimeout(timer);
  },[messages,ready,result,scenario,storageMode]);

  useEffect(()=>{
    const chat=chatRef.current;
    if(chat)chat.scrollTo({top:chat.scrollHeight,behavior:"smooth"});
  },[messages,loading]);

  async function send(e:FormEvent){
    e.preventDefault();
    if(!input.trim()||loading)return;
    const text=input.trim();
    setMessages(m=>[...m,{from:"user",text}]);
    setInput("");setLoading(true);
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
      const r=await fetch("/api/ai/simulator",{method:"POST",headers,body:JSON.stringify({message:text,history:messages,scenario})});
      const data=await r.json();
      if(!r.ok||!data.result)throw new Error(data?.error||"Тренировка временно остановилась.");
      setResult(data.result);
      setMessages(m=>[...m,{from:"client",text:data.result.client_reply}]);
      if(session?.access_token){
        const savedMessages=[...messages,{from:"user" as const,text},{from:"client" as const,text:data.result.client_reply}].slice(-50);
        await fetch("/api/practice/session",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({scenario,messages:savedMessages,result:data.result})});
      }
    }catch{
      setResult({client_reply:"",score:0,feedback:"Ответ помощника задерживается.",better_answer:""});
    }finally{setLoading(false)}
  }

  return <div className="simulator-layout">
    <section className="card">
      <div className="eyebrow">СООБЩЕНИЕ КЛИЕНТА</div>
      <h3>Тренировка переговоров</h3>
      <small className="practice-storage">{storageMode==="account"?"Сохраняется в аккаунте":"Сохраняется в этом браузере"}</small>
      <textarea className="simulator-scenario" value={scenario} onChange={e=>setScenario(e.target.value)}/>
      <div className="simulator-chat" ref={chatRef}>{messages.map((m,i)=><div key={i} className={"bubble "+(m.from==="user"?"user":"")}>{m.text}</div>)}</div>
      <form className="form simulator-form" onSubmit={send}><textarea ref={inputRef} rows={2} value={input} onChange={e=>{setInput(e.target.value);const area=inputRef.current;if(area){area.style.height="auto";area.style.height=Math.min(150,area.scrollHeight)+"px"}}} placeholder="Ответь клиенту…"/><button className="btn btn-lime" disabled={loading||!input.trim()}>{loading?"…":"Отправить"}</button></form>
    </section>
    <section className="card simulator-score">
      <div className="eyebrow">ОЦЕНКА ОТВЕТА</div>
      {!result?<><h3>Ответь клиенту</h3><p className="muted">Помощник оценит ясность, границы, цену, сроки и спокойный тон.</p></>:<>
        <div className="big-score">{result.score}</div><h3>{result.score>=80?"Сильный ответ":result.score>=60?"Хорошая база":"Нужно усилить"}</h3>
        <p>{result.feedback}</p>
        {result.better_answer&&<div className="better-answer"><b>Как можно лучше:</b><p>{result.better_answer}</p></div>}
      </>}
    </section>
  </div>
}
