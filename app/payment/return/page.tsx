"use client";

import Link from "next/link";
import { useEffect,useState } from "react";

type Status={
  status?:string;
  paid?:boolean;
  productName?:string;
  amount?:{value:string;currency:string};
  test?:boolean;
  error?:string;
};

export default function PaymentReturnPage(){
  const [status,setStatus]=useState<Status|null>(null);

  useEffect(()=>{
    let active=true;
    async function check(){
      try{
        const r=await fetch("/api/payments/yookassa/status",{cache:"no-store"});
        const data=await r.json();
        if(active)setStatus(data);
      }catch{
        if(active)setStatus({error:"Не удалось проверить статус платежа"});
      }
    }
    void check();
    const timer=window.setInterval(check,2500);
    return()=>{active=false;window.clearInterval(timer)};
  },[]);

  const succeeded=status?.status==="succeeded"&&status?.paid;

  return <main className="auth-wrap">
    <section className="auth-card payment-result">
      <div className="eyebrow">ОПЛАТА ЧЕРЕЗ ЮKASSA</div>
      {!status&&<>
        <h1>Проверяем оплату…</h1>
        <p>Получаем подтверждение платежа от ЮKassa.</p>
      </>}
      {status?.error&&<>
        <h1>Не нашли платёж</h1>
        <p>{status.error}</p>
      </>}
      {status&&!status.error&&succeeded&&<>
        <div className="payment-check">✓</div>
        <h1>Оплата прошла</h1>
        <p><b>{status.productName}</b> успешно оплачен{status.test?" в тестовом магазине":""}.</p>
        <div className="auth-msg">ЮKassa подтвердила оплату. EDITA выдаёт доступ автоматически после серверного подтверждения. Если профиль был открыт давно, обнови страницу платформы.</div>
      </>}
      {status&&!status.error&&!succeeded&&<>
        <h1>Платёж обрабатывается</h1>
        <p>Оплата ещё не подтверждена. Страница проверяет статус автоматически. Не закрывай её сразу после оплаты.</p>
      </>}
      <div className="auth-form">
        <Link href="/platform" className="btn btn-dark">Перейти в EDITA</Link>
        <Link href="/pricing" className="btn btn-ghost">Тарифы</Link>
      </div>
    </section>
  </main>
}
