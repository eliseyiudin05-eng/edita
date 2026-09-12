import Link from "next/link";

export default function CookiesPage(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">COOKIE</div>
    <h1>Как EDITA использует cookie</h1>
    <p>Cookie — это маленькие технические записи в браузере. Они помогают сайту помнить вход и безопасно работать.</p>
    <section className="legal-card">
      <h2>Что используется сейчас</h2>
      <p><b>Вход и сессия.</b> Supabase Auth использует данные сессии, чтобы понимать, какой аккаунт вошёл.</p>
      <p><b>Закрытый предзапуск.</b> HttpOnly cookie подтверждает, что введён правильный код доступа.</p>
      <p><b>Оплата.</b> После перехода в ЮKassa EDITA временно хранит идентификатор последней оплаты, чтобы проверить её статус после возврата.</p>
      <p><b>Настройки в браузере.</b> LocalStorage хранит, например, факт прохождения подсказок и уведомления о cookie.</p>
    </section>
    <section className="legal-card">
      <h2>Чего сейчас нет</h2>
      <p>В закрытом предзапуске не включены рекламные пиксели, поведенческая реклама и сторонняя аналитика. Если они появятся позже, политика и механизм выбора будут обновлены до включения таких инструментов.</p>
    </section>
    <div className="legal-actions"><Link className="btn btn-dark" href="/privacy">Политика данных</Link><Link className="btn btn-ghost" href="/">На главную</Link></div>
  </div></main>
}
