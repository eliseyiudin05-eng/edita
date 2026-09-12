import Link from "next/link";

export default function SiteFooter(){
  return <footer className="site-footer"><div className="shell footer-grid footer-wide">
    <div>
      <Link className="brand" href="/">EDITA<span>.</span></Link>
      <p>От первой кнопки до первой сильной работы.</p>
      <span className="footer-status">Все функции бесплатны</span>
    </div>
    <div><b>Платформа</b><Link href="/platform">Кабинет</Link><Link href="/signup/editor">Монтажёрам</Link><Link href="/signup/business">Компаниям</Link><Link href="/status">Работа сервисов</Link></div>
    <div><b>Документы</b><Link href="/terms">Условия</Link><Link href="/privacy">Персональные данные</Link><Link href="/personal-data-consent">Согласие</Link><Link href="/cookies">Файлы cookie</Link><Link href="/offer">Условия сервиса</Link><Link href="/challenge-rules">Конкурс на 10 000 ₽</Link><Link href="/arena-rules">Конкурсы компаний</Link></div>
    <div><b>Контакты</b><a href="mailto:support@getedita.app">support@getedita.app</a><Link href="/requisites">Реквизиты</Link><p>Онлайн-сервис</p></div>
  </div><div className="shell footer-bottom">© 2026 EDITA. Регистрация открыта, все функции платформы бесплатны.</div></footer>
}
