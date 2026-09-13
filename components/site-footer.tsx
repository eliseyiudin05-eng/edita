import Link from "next/link";

export default function SiteFooter(){
  return <footer className="site-footer"><div className="shell footer-grid footer-wide">
    <div>
      <Link className="brand footer-brand" href="/">KIVRONIX<span>.</span></Link>
      <p>От первой кнопки до первой сильной работы.</p>
      <span className="footer-status">Ранний доступ бесплатный</span>
    </div>
    <div><b>Платформа</b><Link href="/platform">Кабинет</Link><Link href="/signup/editor">Монтажёрам</Link><Link href="/signup/business">Компаниям</Link><Link href="/status">Работа сервисов</Link></div>
    <div><b>Документы</b><Link href="/terms">Условия</Link><Link href="/privacy">Персональные данные</Link><Link href="/personal-data-consent">Согласие</Link><Link href="/cookies">Файлы cookie</Link><Link href="/offer">Условия сервиса</Link><Link href="/challenge-rules">Конкурс на 10 000 Points</Link><Link href="/arena-rules">Конкурсы компаний</Link></div>
    <div><b>Контакты</b><a href="mailto:support@kivronix.ru">support@kivronix.ru</a><Link href="/requisites">Реквизиты</Link><p>Онлайн-сервис</p></div>
  </div><div className="shell footer-bottom">© 2026 KIVRONIX. Регистрация открыта, оплата пока выключена.</div></footer>
}
