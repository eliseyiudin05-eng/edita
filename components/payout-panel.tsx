"use client";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";

type RequestRow={id:string;amount_cents:number;status:string;created_at:string};

export default function PayoutPanel({balanceCents}:{balanceCents:number}){
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [amount,setAmount]=useState(balanceCents?String(Math.floor(balanceCents/100)):"");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function call(method:"GET"|"POST"){
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=supabase?await supabase.auth.getSession():{data:{session:null}};
    if(!session){setMessage("Сначала войди в аккаунт.");return;}
    const response=await fetch("/api/payouts",{
      method,
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
      body:method==="POST"?JSON.stringify({amountRub:Number(amount)}):undefined
    });
    const result=await response.json().catch(()=>({}));
    if(response.ok){setRows(result.requests||[]);setMessage(method==="POST"?"Заявка создана. Мы проверим данные и сообщим о следующем шаге.":"");}
    else setMessage(result.error||"Не удалось выполнить запрос.");
  }

  useEffect(()=>{void call("GET")},[]);
  async function submit(){setLoading(true);await call("POST");setLoading(false)}
  const status=(value:string)=>value==="pending"?"На проверке":value==="approved"?"Подтверждена":value==="paid"?"Выплачена":"Отклонена";

  return <div className="payout-panel">
    <label className="field-label">Сумма вывода, ₽<input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} placeholder="1000"/></label>
    <button className="btn btn-dark" disabled={loading||balanceCents<10000} onClick={submit}>{loading?"Создаём…":"Запросить вывод"}</button>
    <p className="muted">Минимум 100 ₽. Номер карты здесь вводить не нужно: платёжные данные запрашиваются только через защищённый платёжный сервис после проверки заявки.</p>
    {message&&<div className="auth-msg">{message}</div>}
    {rows.length>0&&<div className="payout-history">{rows.map(row=><div key={row.id}><span>{new Date(row.created_at).toLocaleDateString("ru-RU")}</span><b>{(row.amount_cents/100).toLocaleString("ru-RU")} ₽</b><em>{status(row.status)}</em></div>)}</div>}
  </div>;
}
