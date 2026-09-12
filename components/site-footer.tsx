import Link from "next/link";

export default function SiteFooter(){
  return <footer className="site-footer"><div className="shell footer-grid footer-wide">
    <div>
      <Link className="brand" href="/">EDITA<span>.</span></Link>
      <p>От первой кнопки до первой сильной работы.</p>
      <span className="footer-status">Закрытая бета · 0 ₽</span>
    </div>
    <div><b>Платформа</b><Link href="/pricing">Тарифы</Link><Link href="/platform">Кабинет</Link><Link href="/creators">Для креаторов</Link><Link href="/status">Статус сервисов</Link></div>
    <div><b>Документы</b><Link href="/terms">Условия</Link><Link href="/privacy">Персональные данные</Link><Link href="/personal-data-consent">Согласие</Link><Link href="/cookies">Cookie</Link><Link href="/offer">Доступ и будущая оплата</Link><Link href="/challenge-rules">Конкурс на 10 000 ₽</Link><Link href="/arena-rules">Правила Arena</Link></div>
    <div><b>Контакты</b><a href="mailto:support@getedita.app">support@getedita.app</a><Link href="/requisites">Реквизиты</Link><p>Онлайн-сервис</p></div>
  </div><div className="shell footer-bottom">© 2026 EDITA. В закрытой бете платежи отключены; регистрация доступна только по персональным кодам.</div></footer>
}
