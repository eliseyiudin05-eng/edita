import Link from "next/link";

export default function ArenaRules(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">КОНКУРСЫ КОМПАНИЙ</div>
    <h1>Простые правила</h1>
    <section className="legal-card"><h2>1. Понятное задание</h2><p>До старта компания указывает результат, срок, приз, правила оценки и условия использования работы.</p><h2>2. Победителя выбирает человек</h2><p>Помощник EDITA показывает сильные стороны и возможные правки, а итоговый выбор делает компания.</p><h2>3. Права на работу</h2><p>Коммерческое использование работы возможно после отдельного согласия автора. Условия передачи прав победителем публикуются в задании.</p><h2>4. Закрытый чат</h2><p>После выбора победителя система открывает чат компании с монтажёром. Контакты, ссылки и названия мессенджеров остаются за пределами чата.</p><h2>5. Пользователи до 18 лет</h2><p>Коммерческое участие открывается после подтверждения взрослого.</p></section>
    <div className="legal-actions"><Link className="btn btn-dark" href="/platform#arena">Конкурсы компаний</Link><Link className="btn btn-ghost" href="/terms">Условия</Link></div>
  </div></main>
}
