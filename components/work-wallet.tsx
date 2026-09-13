"use client";
import {useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase-browser";
export default function WorkWallet(){
 const [wallet,setWallet]=useState({available:0,reserved:0,feePercent:12});const [points,setPoints]=useState("1000");const [message,setMessage]=useState("");const [loading,setLoading]=useState(false);
 async function headers():Promise<Record<string,string>>{const {data}=await getSupabaseBrowserClient().auth.getSession();return data.session?{Authorization:"Bearer "+data.session.access_token}:{};}
 async function load(){const r=await fetch("/api/points",{headers:await headers(),cache:"no-store"});if(r.ok)setWallet(await r.json());}
 useEffect(()=>{void load()},[]);
 async function topup(){setLoading(true);setMessage("");const r=await fetch("/api/points",{method:"POST",headers:{...(await headers()),"Content-Type":"application/json"},body:JSON.stringify({points:Number(points)})});const data=await r.json().catch(()=>({}));setLoading(false);if(r.ok&&data.url)window.location.assign(data.url);else setMessage(data.error||"Не удалось начать пополнение.");}
 return <section className="card"><div className="eyebrow">БАЛАНС ДЛЯ РАБОТ</div><h3>{wallet.available.toLocaleString("ru-RU")} KP доступно</h3><p className="muted">В резерве: {wallet.reserved.toLocaleString("ru-RU")} KP. 1 Point = 1 ₽ при пополнении. Комиссия платформы с выполненной работы — {wallet.feePercent}%.</p><div className="split-fields"><input type="number" min="100" max="1000000" value={points} onChange={e=>setPoints(e.target.value)}/><button className="btn btn-dark" onClick={topup} disabled={loading}>{loading?"Открываем оплату…":"Пополнить баланс"}</button></div>{message&&<div className="auth-msg">{message}</div>}</section>;
}
