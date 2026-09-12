import Link from "next/link";

export default function RequisitesPage(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">КОНТАКТЫ</div>
    <h1>EDITA</h1>
    <p>Бесплатная онлайн-платформа для обучения видеомонтажу, разбора роликов, своих работ, заданий и поиска работы.</p>

    <section className="legal-card">
      <h2>Как связаться</h2>
      <dl>
        <div><dt>Сайт</dt><dd>getedita.app</dd></div>
        <div><dt>Поддержка</dt><dd><a href="mailto:support@getedita.app"><u>support@getedita.app</u></a></dd></div>
        <div><dt>Формат работы</dt><dd>Онлайн</dd></div>
      </dl>
    </section>

    <section className="legal-card">
      <h2>Доступ к платформе</h2>
      <p><b>Все функции бесплатны.</b> Банковская карта, подписка и автоматические списания отсутствуют.</p>
      <p>Награды конкурсов и бюджеты вакансий указывают организаторы. Они относятся к работе участников, а сама платформа остаётся бесплатной.</p>
    </section>

    <div className="legal-actions">
      <Link className="btn btn-dark" href="/offer">Условия сервиса</Link>
      <Link className="btn btn-ghost" href="/privacy">Персональные данные</Link>
      <Link className="btn btn-ghost" href="/">На главную</Link>
    </div>
  </div></main>
}
