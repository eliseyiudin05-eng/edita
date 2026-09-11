import Link from "next/link";

export default function DemoAccessPage(){
  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="eyebrow">REVIEW ACCESS</div>
        <h1>Доступ для проверки EDITA</h1>
        <p>
          Для проверки сайта регистрация не требуется. Основной функционал
          платформы доступен в демо-режиме.
        </p>
        <div className="auth-msg">
          <b>Логин:</b> не требуется<br/>
          <b>Пароль:</b> не требуется
        </div>
        <div className="auth-form">
          <Link className="btn btn-dark" href="/platform">Войти в демо</Link>
          <Link className="btn btn-ghost" href="/requisites">Реквизиты</Link>
        </div>
      </section>
    </main>
  );
}
