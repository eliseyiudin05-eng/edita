import Link from "next/link";

export default function RequisitesPage(){
  return (
    <main className="legal-page">
      <div className="legal-shell">
        <Link href="/" className="brand">EDITA<span>.</span></Link>
        <div className="eyebrow">РЕКВИЗИТЫ И ИНФОРМАЦИЯ О СЕРВИСЕ</div>
        <h1>EDITA</h1>
        <p>
          Онлайн-платформа для обучения видеомонтажу, AI-разбора работ,
          практических заданий, портфолио и профессиональных челленджей.
        </p>

        <section className="legal-card">
          <h2>Информация о продавце</h2>
          <dl>
            <div><dt>Наименование сервиса</dt><dd>EDITA</dd></div>
            <div><dt>Сайт</dt><dd>https://getedita.app</dd></div>
            <div><dt>Формат услуг</dt><dd>Цифровые услуги / онлайн-доступ</dd></div>
            <div><dt>Товар 1</dt><dd>EDITA Start — 1 490 ₽</dd></div>
            <div><dt>Товар 2</dt><dd>EDITA AI PRO — 499 ₽ / месяц</dd></div>
          </dl>
        </section>

        <section className="legal-card">
          <h2>Юридические реквизиты</h2>
          <p className="warning">
            Перед боевым подключением оплаты сюда должны быть внесены реальные
            реквизиты ИП или ООО: полное наименование, ИНН, ОГРН/ОГРНИП,
            юридический адрес, расчётный счёт, банк, БИК и корреспондентский счёт.
          </p>
          <dl>
            <div><dt>Юридическое лицо / ИП</dt><dd>Будет указано после регистрации</dd></div>
            <div><dt>ИНН</dt><dd>Будет указано</dd></div>
            <div><dt>ОГРН / ОГРНИП</dt><dd>Будет указано</dd></div>
            <div><dt>Юридический адрес</dt><dd>Будет указано</dd></div>
            <div><dt>Банковские реквизиты</dt><dd>Будут указаны</dd></div>
          </dl>
        </section>

        <section className="legal-card">
          <h2>Получение услуги</h2>
          <p>
            Доступ к цифровым материалам и функциям платформы предоставляется
            онлайн после успешной оплаты. Для подписки AI PRO доступ действует
            в течение оплаченного периода.
          </p>
        </section>

        <div className="legal-actions">
          <Link className="btn btn-dark" href="/platform">Открыть демо платформы</Link>
          <Link className="btn btn-ghost" href="/">На главную</Link>
        </div>
      </div>
    </main>
  );
}
