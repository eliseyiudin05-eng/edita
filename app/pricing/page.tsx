import Link from "next/link";
import BetaUpgradeButton from "@/components/beta-upgrade-button";
import SiteFooter from "@/components/site-footer";
import {curriculumStats} from "@/lib/curriculum";

const comparison=[
  ["Пошаговая Академия",`${curriculumStats.lessons} уроков`,`${curriculumStats.lessons} уроков`],
  ["AI-вопросы по монтажу","Короткий понятный ответ","Подробный персональный план"],
  ["Файл своего Reel","Простой словесный разбор","Глубокий разбор по кадрам и таймкодам"],
  ["Проверка формата","Основные замечания","Scorecard, 7 кадров и приоритет правок"],
  ["История чата","Сохраняется","Сохраняется"],
  ["Сообщество и рейтинги","Доступно","Доступно"],
  ["Обычная цена после беты","1 490 ₽ единоразово","499 ₽ за 30 дней"]
];

export default function PricingPage(){
  return <main className="pricing-page">
    <div className="pricing-shell">
      <nav className="pricing-nav sticky-public-nav"><Link href="/" className="brand">EDITA<span>.</span></Link><Link href="/platform">Открыть платформу</Link></nav>

      <section className="beta-price-hero">
        <div><div className="eyebrow">ЗАКРЫТАЯ БЕТА · 50 МЕСТ</div><h1>Сейчас — 0 ₽</h1><p>На время беты касса отключена. Первые 50 участников могут пройти Академию, проверить базовый AI и бесплатно включить PRO до 12 ноября 2026 года.</p></div>
        <div className="beta-price-number"><small>ВМЕСТО ПОКУПКИ</small><strong>БЕСПЛАТНО</strong><span>Никакой карты и автопродления</span></div>
      </section>

      <div className="pricing-grid beta-pricing-grid">
        <article className="price-card"><div className="eyebrow">БАЗОВЫЙ ДОСТУП</div><h2>EDITA Start</h2><div className="price"><strong>1 490 ₽</strong><span>после беты</span></div><ul><li>Весь маршрут обучения с нуля</li><li>Задания и постепенное открытие уроков</li><li>Простой AI Coach</li><li>Словесный разбор одного Reel</li><li>Портфолио, друзья и рейтинги</li></ul><Link className="btn btn-dark" href="/signup/editor">Занять бесплатное место</Link></article>
        <article className="price-card featured"><div className="eyebrow">МАКСИМАЛЬНЫЙ РАЗБОР</div><h2>EDITA AI PRO</h2><div className="price"><strong>499 ₽</strong><span>30 дней после беты</span></div><ul><li>Всё из базового доступа</li><li>Расширенный разбор Reel по кадрам</li><li>Таймкоды, scorecard и порядок правок</li><li>Проверка hook, ритма, субтитров и ТЗ</li><li>Больше контекста для персональных советов</li></ul><BetaUpgradeButton label="Включить PRO бесплатно"/></article>
      </div>

      <section className="plan-comparison-section">
        <div className="eyebrow">РАЗНИЦА БЕЗ МЕЛКОГО ШРИФТА</div>
        <h2>Что получает пользователь</h2>
        <div className="plan-comparison" role="table" aria-label="Сравнение базового доступа и AI PRO">
          <div className="plan-comparison-row heading" role="row"><b>Функция</b><b>База</b><b>PRO</b></div>
          {comparison.map(([feature,base,pro])=><div className="plan-comparison-row" role="row" key={feature}><strong>{feature}</strong><span>{base}</span><span>{pro}</span></div>)}
        </div>
      </section>

      <div className="pricing-note beta-note"><b>Платежи временно выключены.</b> Перед открытым запуском мы отдельно включим ЮKassa, проверим чеки и покажем окончательные условия. Во время беты списаний нет.</div>
    </div>
    <SiteFooter/>
  </main>;
}
