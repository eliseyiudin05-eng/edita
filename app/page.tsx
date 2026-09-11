import Link from "next/link";

const pillars = [
  ["AI Coach", "Персональный наставник знает твои цели, уровень и прогресс."],
  ["Arena", "Реальные челленджи с одинаковыми исходниками и прозрачным выбором победителя."],
  ["Portfolio", "Лучшие работы автоматически собираются в публичное портфолио."],
  ["Jobs", "Бизнесы нанимают участников по реальным работам, а не по красивому резюме."],
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="topbar shell">
        <Link className="brand" href="/">EDITA<span>.</span></Link>
        <div className="nav-actions">
          <a href="#how">Как работает</a>
          <a href="#business">Для бизнеса</a>
          <Link className="btn btn-dark" href="/platform">Открыть MVP</Link>
        </div>
      </nav>

      <section className="hero shell">
        <div className="eyebrow">LEARN → COMPETE → EARN</div>
        <h1>Не курс по монтажу.<br/><span>Карьерная платформа.</span></h1>
        <p className="hero-copy">Учись с AI-наставником, выполняй реальные ТЗ, собирай портфолио, побеждай в челленджах и находи клиентов внутри одной системы.</p>
        <div className="hero-actions">
          <Link className="btn btn-primary" href="/platform">Попробовать платформу</Link>
          <a className="btn btn-ghost" href="#business">Я представляю бизнес</a>
        </div>
        <div className="hero-proof">
          <div><strong>30 дней</strong><span>до первого сильного портфолио</span></div>
          <div><strong>AI 24/7</strong><span>помогает учиться и разбирать ТЗ</span></div>
          <div><strong>Real Jobs</strong><span>оплачиваемые задачи от компаний</span></div>
        </div>
      </section>

      <section id="how" className="section shell">
        <div className="section-kicker">ОДНА ЭКОСИСТЕМА</div>
        <h2>Человек остаётся с нами после обучения</h2>
        <div className="pillar-grid">{pillars.map(([t,d],i)=><article className="pillar" key={t}><span>0{i+1}</span><h3>{t}</h3><p>{d}</p></article>)}</div>
      </section>

      <section id="business" className="business-band">
        <div className="shell business-grid">
          <div><div className="section-kicker light">ДЛЯ БИЗНЕСА</div><h2>Не угадывайте, хороший ли монтажёр.<br/>Дайте ему реальное ТЗ.</h2></div>
          <div className="business-card"><p>Компания загружает исходники и бриф. Участники делают работы. AI помогает провести первичный разбор. Компания выбирает лучшего и может нанять его на постоянную работу.</p><Link href="/platform?role=business" className="btn btn-light">Посмотреть кабинет бизнеса</Link></div>
        </div>
      </section>
    </main>
  );
}
