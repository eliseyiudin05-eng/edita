import Link from "next/link";

export default function OfferPage(){
  return <main className="legal-page"><div className="legal-shell">
    <Link href="/" className="brand">EDITA<span>.</span></Link>
    <div className="eyebrow">ОПЛАТА</div>
    <h1>Условия платного доступа</h1>
    <p>Оплата проходит через ЮKassa. Перед оплатой нужно войти в аккаунт, чтобы покупка была привязана к нужному профилю.</p>

    <section className="legal-card">
      <h2>EDITA Start — 1 490 ₽</h2>
      <p>Единовременный доступ к стартовой учебной программе и функциям, перечисленным на странице тарифов.</p>

      <h2>EDITA AI PRO — 499 ₽ / 30 дней</h2>
      <p>Доступ к расширенным AI-функциям на 30 дней. Автоматическое продление сейчас не используется.</p>

      <h2>Как проходит оплата</h2>
      <p>EDITA создаёт платёж и переводит пользователя на защищённую страницу ЮKassa. Данные банковской карты вводятся там и не передаются EDITA.</p>

      <h2>Когда появляется доступ</h2>
      <p>После подтверждения успешной оплаты ЮKassa отправляет серверное уведомление. EDITA записывает покупку в аккаунт и выдаёт соответствующий доступ.</p>

      <h2>Возвраты</h2>
      <p>Если нужен возврат, напиши на <a href="mailto:support@getedita.app"><u>support@getedita.app</u></a> и укажи email аккаунта и дату оплаты. Возможность и размер возврата определяются с учётом фактически оказанной цифровой услуги и применимого законодательства.</p>
    </section>

    <section className="legal-card warning">
      <b>Закрытый предзапуск</b>
      <p>ЮKassa сейчас работает в тестовом режиме. Реальные деньги не должны приниматься, пока магазин не переведён в боевой режим и на сайте не заполнены реальные реквизиты продавца.</p>
    </section>

    <div className="legal-actions">
      <Link className="btn btn-dark" href="/pricing">Тарифы</Link>
      <Link className="btn btn-ghost" href="/requisites">Реквизиты</Link>
    </div>
  </div></main>
}