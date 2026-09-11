import Link from "next/link";
import PayButton from "@/components/pay-button";
import SiteFooter from "@/components/site-footer";

export default function PricingPage(){
  return <main className="pricing-page">
    <div className="pricing-shell">
      <nav className="pricing-nav"><Link href="/" className="brand">EDITA<span>.</span></Link><Link href="/platform">Открыть платформу</Link></nav>
      <div className="eyebrow">ТАРИФЫ EDITA</div>
      <h1>Начни с навыка.<br/>Дойди до реальной работы.</h1>
      <p className="pricing-lead">Оплата подключается через ЮKassa. AI PRO на первом этапе продаётся как доступ на 30 дней без автоматического продления.</p>
      <div className="pricing-grid">
        <article className="price-card"><div className="eyebrow">START</div><h2>EDITA Start</h2><div className="price"><strong>1 490 ₽</strong><span>единоразово</span></div><ul><li>Стартовая программа обучения</li><li>Практические задания</li><li>Базовый AI Coach</li><li>Создание портфолио</li><li>Доступ к открытым Challenge</li></ul><PayButton product="start" label="Купить EDITA Start" /></article>
        <article className="price-card featured"><div className="eyebrow">AI PRO</div><h2>EDITA AI PRO</h2><div className="price"><strong>499 ₽</strong><span>30 дней</span></div><ul><li>Расширенный AI Coach</li><li>AI Video Review по кадрам и таймкодам</li><li>Skill Score и персональные рекомендации</li><li>Расширенные Challenge</li><li>Аналитика прогресса</li></ul><PayButton product="ai-pro-30" label="Подключить AI PRO" /></article>
      </div>
      <p className="pricing-note">Оплачивая доступ, пользователь принимает <Link href="/offer"><u>условия платного доступа</u></Link> и <Link href="/terms"><u>условия использования</u></Link>.</p>
    </div>
    <SiteFooter/>
  </main>
}
