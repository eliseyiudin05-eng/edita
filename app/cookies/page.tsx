import Link from "next/link";

export default function CookiesPage(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">ФАЙЛЫ COOKIE</div>
    <h1>Как браузер запоминает вход</h1>
    <p>Cookie — это маленькие технические записи в браузере. Они помогают сайту помнить вход и безопасно работать.</p>
    <section className="legal-card"><h2>Что используется</h2><p><b>Вход.</b> Запись сессии помогает EDITA открыть правильный аккаунт.</p><p><b>Безопасность.</b> Техническая запись защищает запросы пользователя.</p><p><b>Настройки браузера.</b> Локальное хранилище помнит пройденные подсказки и выбор пользователя в уведомлении о cookie.</p></section>
    <section className="legal-card"><h2>Реклама</h2><p>Рекламные пиксели, поведенческая реклама и стороннее слежение отсутствуют.</p></section>
    <div className="legal-actions"><Link className="btn btn-dark" href="/privacy">Политика данных</Link><Link className="btn btn-ghost" href="/">На главную</Link></div>
  </div></main>
}
