import Link from "next/link";

export default function RequisitesPage(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">КОНТАКТЫ И РЕКВИЗИТЫ</div>
    <h1>EDITA</h1>
    <p>Онлайн-платформа для обучения видеомонтажу, AI-разбора, портфолио, заданий и поиска работы.</p>

    <section className="legal-card">
      <h2>Контакты</h2>
      <dl>
        <div><dt>Сайт</dt><dd>https://getedita.app</dd></div>
        <div><dt>Поддержка</dt><dd><a href="mailto:support@getedita.app"><u>support@getedita.app</u></a></dd></div>
        <div><dt>Формат работы</dt><dd>Онлайн</dd></div>
      </dl>
    </section>

    <section className="legal-card">
      <h2>Услуги и цены</h2>
      <dl>
        <div><dt>EDITA Start</dt><dd>1 490 ₽, единовременный доступ</dd></div>
        <div><dt>EDITA AI PRO</dt><dd>499 ₽ за 30 дней, без автоматического продления</dd></div>
      </dl>
    </section>

    <section className="legal-card warning">
      <h2>Реквизиты продавца ещё не заполнены</h2>
      <p>До публичного запуска и приёма реальных денег здесь должны быть реальные данные ИП или ООО: полное наименование, ИНН, ОГРН/ОГРНИП, юридический адрес и необходимые платёжные реквизиты.</p>
      <p>Закрытый предзапуск не должен использоваться для реального коммерческого приёма платежей, пока этот блок не заполнен.</p>
    </section>

    <div className="legal-actions">
      <Link className="btn btn-dark" href="/offer">Оплата и возвраты</Link>
      <Link className="btn btn-ghost" href="/privacy">Персональные данные</Link>
      <Link className="btn btn-ghost" href="/">На главную</Link>
    </div>
  </div></main>
}