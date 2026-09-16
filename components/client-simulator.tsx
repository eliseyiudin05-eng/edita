"use client";

import {FormEvent,useEffect,useRef,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type Msg={from:"client"|"user";text:string};
type Scenario={
  id:string;
  client_name:string;
  client_role:string;
  personality:string;
  project:string;
  budget:string;
  deadline:string;
  hidden_concern:string;
  difficulty:"Базовая"|"Средняя"|"Сложная";
  opening_message:string;
};
type Result={
  client_reply:string;
  score:number;
  feedback:string;
  coach_hint:string;
  deal_status:"ongoing"|"won"|"lost";
  deal_reason:string;
  scenario_meta?:Scenario;
};

const initialScenario:Scenario={
  id:"starter-budget",
  client_name:"Анна",
  client_role:"владелица небольшого магазина",
  personality:"дружелюбная, но внимательно относится к бюджету",
  project:"вертикальный ролик о новом товаре",
  budget:"3 000 ₽",
  deadline:"через три дня",
  hidden_concern:"Хочет понять, за что платит и сколько правок входит.",
  difficulty:"Базовая",
  opening_message:"Привет! Нужен короткий ролик о новом товаре. Бюджет 3 000 ₽ — можешь объяснить, что войдёт в эту сумму?"
};

export default function ClientSimulator(){
  const [scenario,setScenario]=useState<Scenario>(initialScenario);
  const [messages,setMessages]=useState<Msg[]>([{from:"client",text:initialScenario.opening_message}]);
  const [input,setInput]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [loading,setLoading]=useState(false);
  const [loadingScenario,setLoadingScenario]=useState(false);
  const [ready,setReady]=useState(false);
  const [storageMode,setStorageMode]=useState<"account"|"browser">("browser");
  const [round,setRound]=useState(1);
  const [recentScenarios,setRecentScenarios]=useState<string[]>([]);
  const [lastSuccess,setLastSuccess]=useState<{name:string;score:number}|null>(null);
  const [scenarioError,setScenarioError]=useState("");
  const chatRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const resetTimerRef=useRef<number|null>(null);

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
              const restored=parseScenario(data.session.scenario,data.session.result?.scenario_meta);
              if(restored)setScenario(restored);
              if(Array.isArray(data.session.messages)&&data.session.messages.length)setMessages(data.session.messages);
              if(data.session.result)setResult(normalizeResult(data.session.result));
            }
            setReady(true);
            return;
          }
        }
        const saved=JSON.parse(localStorage.getItem("kivronix_practice_simulator_v2")||"null");
        if(active&&saved){
          const restored=parseScenario(saved.scenario,saved.result?.scenario_meta);
          if(restored)setScenario(restored);
          if(Array.isArray(saved.messages)&&saved.messages.length)setMessages(saved.messages);
          if(saved.result&&typeof saved.result==="object")setResult(normalizeResult(saved.result));
          if(Number.isInteger(saved.round))setRound(saved.round);
          if(Array.isArray(saved.recentScenarios))setRecentScenarios(saved.recentScenarios.slice(-8));
        }
      }catch{}finally{if(active)setReady(true)}
    }
    void load();
    return()=>{active=false;if(resetTimerRef.current)window.clearTimeout(resetTimerRef.current)};
  },[]);

  useEffect(()=>{
    if(!ready)return;
    const persistedResult=result?{...result,scenario_meta:scenario}:null;
    const snapshot={scenario:JSON.stringify(scenario),messages:messages.slice(-50),result:persistedResult,round,recentScenarios:recentScenarios.slice(-8)};
    try{localStorage.setItem("kivronix_practice_simulator_v2",JSON.stringify(snapshot))}catch{}
    if(storageMode!=="account")return;
    const timer=window.setTimeout(async()=>{
      try{
        const supabase=getSupabaseBrowserClient();
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token)await fetch("/api/practice/session",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify(snapshot)});
      }catch{}
    },650);
    return()=>window.clearTimeout(timer);
  },[messages,ready,recentScenarios,result,round,scenario,storageMode]);

  useEffect(()=>{
    const chat=chatRef.current;
    if(chat)chat.scrollTo({top:chat.scrollHeight,behavior:"smooth"});
  },[messages,loading]);

  async function createScenario(successScore?:number){
    if(loadingScenario)return;
    if(resetTimerRef.current){window.clearTimeout(resetTimerRef.current);resetTimerRef.current=null}
    setLoadingScenario(true);
    setScenarioError("");
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
      const nextRecent=[...recentScenarios,`${scenario.client_role}: ${scenario.project}, ${scenario.budget}`].slice(-8);
      const response=await fetch("/api/ai/simulator",{method:"POST",headers,body:JSON.stringify({mode:"new_scenario",round:round+1,recentScenarios:nextRecent})});
      const data=await response.json();
      if(!response.ok||!data.scenario)throw new Error("Новый клиент пока не появился.");
      if(successScore!=null)setLastSuccess({name:scenario.client_name,score:successScore});
      setRecentScenarios(nextRecent);
      setRound(value=>value+1);
      setScenario(data.scenario);
      setMessages([{from:"client",text:data.scenario.opening_message}]);
      setResult(null);
      setInput("");
      inputRef.current?.focus();
    }catch(error){
      setScenarioError(error instanceof Error?error.message:"Нового клиента пока не удалось создать. Попробуй ещё раз.");
    }finally{setLoadingScenario(false)}
  }

  async function send(event:FormEvent){
    event.preventDefault();
    if(!input.trim()||loading||loadingScenario)return;
    const text=input.trim();
    const history=[...messages,{from:"user" as const,text}];
    setMessages(history);
    setInput("");setLoading(true);
    if(inputRef.current)inputRef.current.style.height="auto";
    try{
      const supabase=getSupabaseBrowserClient();
      const {data:{session}}=await supabase.auth.getSession();
      const headers:Record<string,string>={"Content-Type":"application/json"};
      if(session?.access_token)headers.Authorization="Bearer "+session.access_token;
      const response=await fetch("/api/ai/simulator",{method:"POST",headers,body:JSON.stringify({message:text,history:messages,scenario})});
      const data=await response.json();
      if(!response.ok||!data.result)throw new Error(data?.error||"Тренировка временно остановилась.");
      const nextResult=normalizeResult(data.result);
      setResult(nextResult);
      setMessages(current=>[...current,{from:"client",text:nextResult.client_reply}]);
      if(nextResult.deal_status==="won"&&nextResult.score>=65){
        resetTimerRef.current=window.setTimeout(()=>void createScenario(nextResult.score),2200);
      }
    }catch{
      setResult({client_reply:"",score:0,feedback:"Ответ клиента задерживается. Попробуй отправить сообщение ещё раз.",coach_hint:"Какая одна деталь поможет клиенту лучше понять условия?",deal_status:"ongoing",deal_reason:"Связь с помощником временно прервалась."});
    }finally{setLoading(false)}
  }

  return <div className="practice-simulator">
    {lastSuccess?<div className="practice-success-banner"><span>✓</span><div><b>Сделка с {lastSuccess.name} завершена · {lastSuccess.score}/100</b><small>ИИ уже создал нового персонажа с другой задачей.</small></div><button type="button" aria-label="Закрыть сообщение" onClick={()=>setLastSuccess(null)}>×</button></div>:null}
    {scenarioError?<div className="practice-error-banner" role="alert"><span>!</span><p>{scenarioError}</p><button type="button" onClick={()=>void createScenario()}>Повторить</button></div>:null}
    <div className="practice-round-head"><div><div className="eyebrow">ПРАКТИКА #{round}</div><h2>Реальный разговор с новым заказчиком</h2><p>Договорись о результате своими словами. ИИ играет клиента и подсказывает направление, но не пишет ответ за тебя.</p></div><button className="btn btn-ghost" type="button" disabled={loadingScenario||loading} onClick={()=>void createScenario()}>{loadingScenario?"Создаём клиента…":"Другой заказчик ↻"}</button></div>

    <div className="simulator-layout humanized">
      <section className="card simulator-conversation">
        <header className="practice-client-card"><span className="practice-avatar">{scenario.client_name.slice(0,1)}</span><div><b>{scenario.client_name}</b><small>{scenario.client_role}</small></div><em>{scenario.difficulty}</em></header>
        <div className="practice-brief-grid"><span><small>Задача</small><b>{scenario.project}</b></span><span><small>Бюджет</small><b>{scenario.budget}</b></span><span><small>Срок</small><b>{scenario.deadline}</b></span><span><small>Характер</small><b>{scenario.personality}</b></span></div>
        <small className="practice-storage">{storageMode==="account"?"Диалог сохраняется в аккаунте":"Диалог сохраняется в этом браузере"}</small>
        <div className="simulator-chat" ref={chatRef}>{messages.map((message,index)=><div key={`${index}-${message.text.slice(0,16)}`} className={message.from==="user"?"practice-message user":"practice-message client"}>{message.from==="client"?<span>{scenario.client_name.slice(0,1)}</span>:null}<div><small>{message.from==="client"?scenario.client_name:"Ты"}</small><p>{message.text}</p></div></div>)}{loading?<div className="practice-typing"><i/><i/><i/><span>{scenario.client_name} печатает</span></div>:null}</div>
        <form className="simulator-form platform-composer" onSubmit={send}>
          <span className="composer-icon" aria-hidden="true">✎</span>
          <textarea ref={inputRef} rows={2} maxLength={2000} value={input} onChange={event=>{setInput(event.target.value);const area=inputRef.current;if(area){area.style.height="auto";area.style.height=Math.min(160,area.scrollHeight)+"px"}}} placeholder="Напиши свой ответ заказчику…" aria-label="Ответ заказчику"/>
          <button className="composer-send" aria-label="Отправить ответ" title="Отправить" disabled={loading||loadingScenario||!input.trim()}>↑</button>
        </form>
      </section>

      <aside className="card simulator-score human-coach">
        <div className="eyebrow">ТРЕНЕР ПЕРЕГОВОРОВ</div>
        {!result?<><span className="coach-orb">✦</span><h3>Сначала пойми клиента</h3><p className="muted">Уточни результат, объясни состав цены и постепенно зафиксируй срок и правки. Формулировку выбираешь ты.</p><div className="coach-start-list"><span>1. Что клиент хочет получить?</span><span>2. За что он платит?</span><span>3. Что нужно согласовать дальше?</span></div></>:<>
          <div className={`deal-state ${result.deal_status}`}><span>{result.deal_status==="won"?"✓":result.deal_status==="lost"?"×":"↗"}</span><div><b>{result.deal_status==="won"?"Сделка заключена":result.deal_status==="lost"?"Клиент отказался":"Переговоры продолжаются"}</b><small>{result.deal_reason}</small></div></div>
          <div className="big-score">{result.score}<span>/100</span></div><h3>{result.score>=80?"Сильный ход":result.score>=65?"Хороший рабочий ответ":result.score>=45?"Есть основа":"Нужно точнее понять задачу"}</h3>
          <p>{result.feedback}</p>
          <div className="coach-hint"><span>?</span><div><b>Подсказка без готового ответа</b><p>{result.coach_hint}</p></div></div>
          {result.deal_status==="won"&&result.score>=65?<div className="new-client-loading"><i/>Создаём нового клиента и новую ситуацию…</div>:null}
          {result.deal_status==="lost"?<button className="btn btn-dark" type="button" onClick={()=>void createScenario()}>Разобрать новую ситуацию</button>:null}
        </>}
      </aside>
    </div>
  </div>;
}

function parseScenario(value:unknown,fallback:unknown):Scenario|null{
  if(fallback&&typeof fallback==="object"&&"opening_message" in fallback)return fallback as Scenario;
  if(typeof value!=="string"||!value.trim())return null;
  try{const parsed=JSON.parse(value);return parsed&&typeof parsed==="object"&&typeof parsed.opening_message==="string"?parsed as Scenario:null}catch{return null}
}

function normalizeResult(value:any):Result{
  return {
    client_reply:String(value?.client_reply||""),
    score:Math.max(0,Math.min(100,Number(value?.score)||0)),
    feedback:String(value?.feedback||"Продолжай уточнять условия."),
    coach_hint:String(value?.coach_hint||"Какую одну важную деталь стоит уточнить следующим сообщением?"),
    deal_status:value?.deal_status==="won"||value?.deal_status==="lost"?value.deal_status:"ongoing",
    deal_reason:String(value?.deal_reason||"Переговоры продолжаются."),
    scenario_meta:value?.scenario_meta,
  };
}
