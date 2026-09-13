import Link from "next/link";
import PlanInterest from "@/components/plan-interest";
import SiteFooter from "@/components/site-footer";
import {futurePlans} from "@/lib/plans";

const editor=futurePlans.creator_plus;
const business=futurePlans.studio_plus;

export default function PricingPage(){
  return <main className="landing pricing-page">
    <nav className="topbar shell sticky-public-nav pricing-nav">
      <Link className="brand" href="/">KIVRONIX<span>.</span></Link>
      <div className="nav-actions"><Link href="/">Главная</Link><Link href="/login">Войти</Link><Link className="btn btn-dark" href="/signup/editor">Начать бесплатно</Link></div>
    </nav>

    <section className="shell beta-price-hero">
      <div><div className="eyebrow">ОСНОВНЫЕ ФУНКЦИИ БЕСПЛАТНО</div><h1>Начните за 0 ₽.</h1><p>Учебные и бизнес-инструменты KIVRONIX доступны без банковской карты. Дополнительные возможности Creator+ и Studio+ подключаются только отдельным действием пользователя.</p></div>
      <div className="beta-price-number"><small>ДОСТУП</small><strong>0 ₽</strong><span>банковская карта не нужна</span></div>
    </section>

    <section className="section shell"><div className="section-kicker">ОПЛАТА РАБОТ</div><h2>Комиссия только за пополнение</h2><p className="section-lead">При пополнении рабочего баланса за каждый 1 ₽ базовой суммы зачисляется 1 KIVRONIX Point, а сверху добавляется комиссия 5%. Заказчик назначает цену работы в Points, и после принятия результата монтажёр получает 100% этой цены — комиссия между сторонами 0%.</p></section>

    <section className="section shell">
      <div className="section-kicker">ДВА ОТДЕЛЬНЫХ ТАРИФА</div>
      <h2>Под задачу пользователя</h2>
      <div className="pricing-grid beta-pricing-grid">
        <article className="price-card">
          <span className="plan-tag">МОНТАЖЁРУ</span><h3>{editor.name}</h3>
          <div className="price"><strong>{editor.priceRub.toLocaleString("ru-RU")} ₽</strong><span>/ месяц · ориентир</span></div>
          <p>{editor.description}</p>
          <ul>{editor.features.map(feature=><li key={feature}>{feature}</li>)}</ul>
          <p className="beta-note">Планируется обмен: {editor.pointsPrice} KIVRONIX Points за 30 дней Creator+. Обмен будет включён только после финальной проверки.</p>
          <PlanInterest audience="editor" plan="creator_plus"/>
        </article>
        <article className="price-card featured">
          <span className="plan-tag">КОМПАНИИ</span><h3>{business.name}</h3>
          <div className="price"><strong>{business.priceRub.toLocaleString("ru-RU")} ₽</strong><span>/ месяц · ориентир</span></div>
          <p>{business.description}</p>
          <ul>{business.features.map(feature=><li key={feature}>{feature}</li>)}</ul>
          <p className="beta-note">Публикация денежных призов не является оплатой подписки: призовой фонд компании всегда учитывается отдельно.</p>
          <PlanInterest audience="business" plan="studio_plus"/>
        </article>
      </div>
    </section>

    <section className="plan-comparison-section shell">
      <div className="section-kicker">ЧТО ОСТАНЕТСЯ ДОСТУПНЫМ</div><h2>Основа KIVRONIX не исчезнет</h2>
      <div className="plan-comparison">
        <div className="plan-comparison-row heading"><strong>Возможность</strong><strong>Ранний доступ</strong><strong>Платный план</strong></div>
        <div className="plan-comparison-row"><strong>Уроки и учебный прогресс</strong><span>Открыто</span><span>Открыто</span></div>
        <div className="plan-comparison-row"><strong>Профиль и портфолио</strong><span>Открыто</span><span>Расширенная аналитика</span></div>
        <div className="plan-comparison-row"><strong>Помощник и разбор роликов</strong><span>Базовые лимиты после запуска</span><span>Расширенные лимиты</span></div>
        <div className="plan-comparison-row"><strong>Конкурсы компаний</strong><span>Участие открыто</span><span>Дополнительные инструменты, без покупки места</span></div>
      </div>
      <p className="muted">Цены и состав — предварительные. Перед включением оплаты KIVRONIX покажет окончательные условия и попросит отдельное подтверждение.</p>
    </section>
    <SiteFooter/>
  </main>;
}
