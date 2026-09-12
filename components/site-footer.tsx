import Link from "next/link";

export default function SiteFooter(){
  return <footer className="site-footer"><div className="shell footer-grid footer-wide">
    <div>
      <Link className="brand" href="/">EDITA<span>.</span></Link>
      <p>От первого монтажа до первой работы.</p>
      <span className="footer-status">Закрытый предзапуск</span>
    </div>
    <div><b>Платформа</b><Link href="/pricing">Тарифы</Link><Link href="/platform">Кабинет</Link><Link href="/status">Статус сервисов</Link></div>
    <div><b>Документы</b><Link href="/terms">Условия</Link><Link href="/privacy">Персональные данные</Link><Link href="/personal-data-consent">Согласие</Link><Link href="/cookies">Cookie</Link><Link href="/offer">Оплата и возвраты</Link><Link href="/arena-rules">Правила Arena</Link></div>
    <div><b>Контакты</b><a href="mailto:support@getedita.app">support@getedita.app</a><Link href="/requisites">Реквизиты</Link><p>Онлайн-сервис</p></div>
  </div><div className="shell footer-bottom">© 2026 EDITA. На закрытом предзапуске реальные платежи и публичная регистрация не запускаются.</div></footer>
}
