import Link from "next/link";

export default function RequisitesPage(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">KIVRONIX<span>.</span></Link>
    <div className="eyebrow">КОНТАКТЫ</div>
    <h1>KIVRONIX</h1>
    <p>Онлайн-платформа для обучения видеомонтажу, разбора роликов, своих работ, заданий и поиска работы.</p>

    <section className="legal-card">
      <h2>Как связаться</h2>
      <dl>
        <div><dt>Сайт</dt><dd>kivronix.ru</dd></div>
        <div><dt>Поддержка</dt><dd><a href="mailto:support@kivronix.ru"><u>support@kivronix.ru</u></a></dd></div>
        <div><dt>Формат работы</dt><dd>Онлайн</dd></div>
      </dl>
    </section>

    <section className="legal-card">
      <h2>Доступ к платформе</h2>
      <p><b>Ранний доступ открыт бесплатно.</b> Банковская карта и автоматические списания отсутствуют.</p>
      <p>Награды конкурсов и бюджеты вакансий указывают организаторы. Они относятся к работе участников. Будущие планы включатся только после публикации окончательных условий и отдельного подтверждения пользователя.</p>
    </section>

    <div className="legal-actions">
      <Link className="btn btn-dark" href="/offer">Условия сервиса</Link>
      <Link className="btn btn-ghost" href="/privacy">Персональные данные</Link>
      <Link className="btn btn-ghost" href="/">На главную</Link>
    </div>
  </div></main>
}
