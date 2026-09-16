"use client";

type BusinessTab="home"|"academy"|"insights"|"practice"|"coach"|"review"|"kivronix-challenges"|"arena"|"portfolio"|"jobs"|"messages"|"community"|"wallet"|"plans"|"profile"|"business";

export default function BusinessDashboard({stats,points,onGo}:{stats:{challenges:number;submissions:number;jobs:number};points:number;onGo:(tab:BusinessTab)=>void}){
  const conversion=stats.challenges?Math.round(stats.submissions/stats.challenges):0;
  return <div className="business-command-center">
    <section className="business-hero-panel">
      <div><div className="eyebrow">ЦЕНТР УПРАВЛЕНИЯ КОНТЕНТОМ</div><h2>Найдите монтажёра с подходящим опытом под вашу задачу</h2><p>KIVRONIX — это не только обучение новичков. На платформе работают и профессиональные монтажёры с готовым портфолио. Создайте вакансию, бриф или конкурс, сравните уровень кандидатов и выберите исполнителя — без перехода на сторонние площадки.</p><div className="lesson-actions"><button className="btn btn-lime" onClick={()=>onGo("business")}>Создать задачу</button><button className="btn btn-light" onClick={()=>onGo("coach")}>Обсудить идею с ИИ</button></div></div>
      <div className="business-score-wrap"><div className="business-score-orbit"><small>ПОТЕНЦИАЛ КОМАНДЫ</small><strong>{Math.min(100,35+stats.submissions*4+stats.challenges*8)}</strong><span>из 100</span></div><details><summary>Что это?</summary><p>Ориентир готовности вашей команды регулярно выпускать видео. Он растёт с числом понятных задач, полученных работ и проверенных гипотез. Это не прогноз продаж.</p></details></div>
    </section>

    <section className="business-kpi-grid">
      <article><span>Активные конкурсы</span><strong>{stats.challenges}</strong><button onClick={()=>onGo("business")}>Управлять →</button></article>
      <article><span>Работы монтажёров</span><strong>{stats.submissions}</strong><small>{conversion||"—"} в среднем на конкурс</small></article>
      <article><span>Открытые вакансии</span><strong>{stats.jobs}</strong><button onClick={()=>onGo("business")}>Найти человека →</button></article>
      <article className="points-kpi"><span>Баланс компании</span><strong>{points.toLocaleString("ru-RU")} KP</strong><small>1 KIVRONIX Point = 1 ₽ внутри платформы</small></article>
    </section>

    <div className="business-dashboard-grid">
      <section className="card business-funnel"><div className="eyebrow">ВОРОНКА ПОДБОРА</div><h3>От задачи до постоянного монтажёра</h3><div className="funnel-row"><b>1</b><span>Укажите задачу и необходимый уровень опыта</span></div><div className="funnel-row"><b>2</b><span>Сравните портфолио, навыки и результаты кандидатов</span></div><div className="funnel-row"><b>3</b><span>Выберите исполнителя и откройте закрытый чат</span></div><div className="funnel-row"><b>4</b><span>Сохраните монтажёра в команду для следующих проектов</span></div></section>
      <section className="card"><div className="eyebrow">БЫСТРЫЕ ДЕЙСТВИЯ</div><h3>Что сделать сегодня</h3><div className="business-quick-actions"><button onClick={()=>onGo("review")}><b>Проверить Reels</b><span>Оценить ролик до публикации</span></button><button onClick={()=>onGo("arena")}><b>Открыть лигу</b><span>Посмотреть рейтинг компаний</span></button><button onClick={()=>onGo("profile")}><b>Заполнить бренд</b><span>Сохранить аудиторию и стиль</span></button><button onClick={()=>onGo("insights")}><b>Спросить компании</b><span>Закрытое профессиональное обсуждение</span></button></div></section>
    </div>
    <section className="business-value-section"><div className="eyebrow">ЗАЧЕМ БИЗНЕСУ ОСТАВАТЬСЯ В KIVRONIX</div><h3>Вся работа с видео сохраняется в одной системе</h3><div className="business-value-grid"><article><b>Выбор по доказательствам</b><span>Уровень, AI‑оценка, портфолио, тестовые работы и отзывы рядом.</span></article><article><b>Быстрый повторный найм</b><span>История диалогов и сильные специалисты остаются доступными для следующего проекта.</span></article><article><b>Понятные брифы</b><span>Помощник превращает бизнес‑цель в критерии, формат и действие зрителя.</span></article><article><b>Контент под контролем</b><span>Задания, файлы, правки, оплата и финальная версия связаны в одном процессе.</span></article><article><b>Рост на данных</b><span>Сравнивайте удержание, досмотры и целевые действия, а не только просмотры.</span></article><article><b>Безопасное общение</b><span>Чат открывается внутри платформы, а отзывы проходят модерацию.</span></article></div></section>
  </div>;
}
