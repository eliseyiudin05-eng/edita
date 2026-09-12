"use client";

import {useState} from "react";

export default function DemoAccessButton({className="btn btn-lime"}:{className?:string}){
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  async function openDemo(){
    setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/auth/demo",{method:"POST"});
      const data=await response.json();
      if(!response.ok||!data?.url)throw new Error(data?.error||"Не удалось открыть демо-аккаунт.");
      window.location.assign(data.url);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Не удалось открыть демо-аккаунт.");
      setLoading(false);
    }
  }

  return <div className="demo-access">
    <button type="button" className={className} disabled={loading} onClick={openDemo}>
      {loading?"Открываем аккаунт…":"Войти в демо-аккаунт"}
    </button>
    {error?<div className="auth-msg">{error}</div>:null}
  </div>;
}
