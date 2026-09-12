import Link from "next/link";
import DemoAccessButton from "@/components/demo-access-button";

export default function DemoAccessPage(){
  return (
    <main className="auth-wrap">
      <section className="auth-card">
        <div className="eyebrow">REVIEW ACCESS</div>
        <h1>Доступ для проверки EDITA</h1>
        <p>
          Нажмите одну кнопку — EDITA безопасно откроет готовый аккаунт ученика.
          Email и пароль вводить не нужно.
        </p>
        <div className="auth-msg">
          <b>Роль:</b> ученик 14–17 лет<br/>
          <b>Маршрут:</b> CapCut с нуля → первый Reel
        </div>
        <div className="auth-form">
          <DemoAccessButton/>
          <Link className="btn btn-dark" href="/login">Войти в свой аккаунт</Link>
          <Link className="btn btn-ghost" href="/onboarding">Создать аккаунт</Link>
          <Link className="btn btn-ghost" href="/requisites">Реквизиты</Link>
        </div>
        <small>Это общий тестовый аккаунт: прогресс и история AI могут быть видны другим проверяющим.</small>
      </section>
    </main>
  );
}
