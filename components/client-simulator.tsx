"use client";

import {FormEvent,useState} from "react";

type Msg={from:"client"|"user";text:string};
type Result={client_reply:string;score:number;feedback:string;better_answer:string};

export default function ClientSimulator(){
  const [scenario,setScenario]=useState("Клиент хочет Reel 30 секунд за 1 500 ₽ вместо предложенных 3 000 ₽ и просит «пару правок без ограничений».");
  const [messages,setMessages]=useState<Msg[]>([{from:"client",text:"Мне нравится, но 3 000 дорого. Давай за 1 500 и если что потом ещё поправим?"}]);
  const [input,setInput]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [loading,setLoading]=useState(false);

  async function send(e:FormEvent){
    e.preventDefault();
    if(!input.trim()||loading)return;
    const text=input.trim();
    setMessages(m=>[...m,{from:"user",text}]);
    setInput("");setLoading(true);
    try{
      const r=await fetch("/api/ai/simulator",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,history:messages,scenario})});
      const data=await r.json();
      if(!r.ok||!data.result)throw new Error(data?.error||"Simulator failed");
      setResult(data.result);
      setMessages(m=>[...m,{from:"client",text:data.result.client_reply}]);
    }catch{
      setResult({client_reply:"",score:0,feedback:"Не удалось получить ответ AI.",better_answer:""});
    }finally{setLoading(false)}
  }

  return <div className="simulator-layout">
    <section className="card">
      <div className="eyebrow">CLIENT SCENARIO</div>
      <h3>Тренировка переговоров</h3>
      <textarea className="simulator-scenario" value={scenario} onChange={e=>setScenario(e.target.value)}/>
      <div className="simulator-chat">{messages.map((m,i)=><div key={i} className={"bubble "+(m.from==="user"?"user":"")}>{m.text}</div>)}</div>
      <form className="form" onSubmit={send}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ответь клиенту…"/><button className="btn btn-lime" disabled={loading}>{loading?"…":"Отправить"}</button></form>
    </section>
    <section className="card simulator-score">
      <div className="eyebrow">COACH SCORE</div>
      {!result?<><h3>Ответь клиенту</h3><p className="muted">AI оценит ясность, границы, цену, сроки и профессиональный тон.</p></>:<>
        <div className="big-score">{result.score}</div><h3>{result.score>=80?"Сильный ответ":result.score>=60?"Хорошая база":"Нужно усилить"}</h3>
        <p>{result.feedback}</p>
        {result.better_answer&&<div className="better-answer"><b>Как можно лучше:</b><p>{result.better_answer}</p></div>}
      </>}
    </section>
  </div>
}
