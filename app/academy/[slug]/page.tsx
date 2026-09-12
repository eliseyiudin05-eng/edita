import Link from "next/link";
import {notFound} from "next/navigation";
import AiCoach from "@/components/ai-coach";
import LessonProgressButton from "@/components/lesson-progress-button";
import LessonRouteGate from "@/components/lesson-route-gate";
import {curriculum,lessonBySlug} from "@/lib/curriculum";

export default async function LessonPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const lesson=lessonBySlug(slug);
  if(!lesson)notFound();
  const index=curriculum.findIndex(item=>item.slug===slug);
  const previous=index>0?curriculum[index-1]:null;
  const next=index<curriculum.length-1?curriculum[index+1]:null;

  return <main className="lesson-shell-page">
    <nav className="lesson-topbar">
      <Link href="/platform#academy" className="brand">EDITA<span>.</span></Link>
      <div className="lesson-top-actions"><Link href="/platform#academy" className="btn btn-ghost">← В Академию</Link><Link href="/platform#home" className="btn btn-ghost">В кабинет</Link></div>
    </nav>

    <header className="lesson-hero">
      <div className="lesson-count">{String(index+1).padStart(2,"0")} / {curriculum.length}</div>
      <div>
        <div className="eyebrow">{lesson.module}</div>
        <h1>{lesson.title}</h1>
        <p>{lesson.summary}</p>
        <div className="lesson-meta">
          <span>{lesson.level}</span><span>{lesson.minutes} минут</span><span>{lesson.software}</span><span>+{lesson.xp} XP</span>
        </div>
      </div>
    </header>

    <LessonRouteGate requiredSlugs={curriculum.slice(0,index).map(item=>item.slug)} previousSlug={previous?.slug}>
    <div className="lesson-layout">
      <div className="lesson-content">
        <section className="lesson-panel lesson-simple">
          <div className="eyebrow">ОБЪЯСНЕНИЕ БЕЗ СЛОЖНЫХ СЛОВ</div>
          <h2>Что это такое?</h2>
          <p className="lesson-lead">{lesson.simple}</p>
          <div className="lesson-example"><b>Пример</b><span>{lesson.example}</span></div>
        </section>

        {lesson.clicks?.length?<section className="lesson-panel">
          <div className="eyebrow">ВИЗУАЛЬНАЯ КАРТА</div>
          <h2>Куда нажать</h2>
          <p className="muted">Названия кнопок могут немного отличаться после обновления, но путь и результат остаются теми же.</p>
          <div className="editor-map" aria-label="Упрощённая схема интерфейса программы">
            <div className="editor-map-top"><i/><i/><i/><span>{lesson.software}</span></div>
            <div className="editor-map-body">
              <div className="editor-map-media"><b>Медиа</b><span/><span/><span/></div>
              <div className="editor-map-preview"><div>9:16</div><small>окно просмотра</small></div>
              <div className="editor-map-tools"><b>Инструменты</b><span/><span/><span/><span/></div>
            </div>
            <div className="editor-map-timeline"><b>Таймлайн</b><span/><span/><i/></div>
          </div>
          <ol className="click-path">
            {lesson.clicks.map((item,itemIndex)=><li key={item.where}>
              <b>{itemIndex+1}</b><div><span>{item.where}</span><strong>{item.action}</strong><small>Результат: {item.result}</small></div>
            </li>)}
          </ol>
        </section>:null}

        {lesson.words?.length?<section className="lesson-panel">
          <h2>Слова, которые пригодятся</h2>
          <div className="word-list">{lesson.words.map(item=><div className="word-row" key={item.term}><b>{item.term}</b><span>{item.meaning}</span></div>)}</div>
        </section>:null}

        <section className="lesson-panel">
          <div className="eyebrow">ДЕЛАЙ ВМЕСТЕ С УРОКОМ</div>
          <h2>По шагам</h2>
          <ol className="lesson-steps">{lesson.steps.map((step,itemIndex)=><li key={step}><span>{itemIndex+1}</span><p>{step}</p></li>)}</ol>
        </section>

        <section className="lesson-two-columns">
          <div className="lesson-panel checklist-panel"><h2>Как понять, что готово</h2>{lesson.checklist.map(item=><p key={item}><span>✓</span>{item}</p>)}</div>
          <div className="lesson-panel mistakes-panel"><h2>Частые ошибки</h2>{lesson.mistakes.map(item=><p key={item}><span>!</span>{item}</p>)}</div>
        </section>

        <section className="lesson-panel lifehack-panel"><div className="lifehack-icon">⚡</div><div><div className="eyebrow">ЛАЙФХАК</div><h2>Сделай быстрее</h2><p>{lesson.lifehack}</p></div></section>

        <section className="lesson-panel assignment-card">
          <div className="eyebrow">МАЛЕНЬКАЯ ПРАКТИКА</div>
          <h2>Теперь попробуй сам</h2>
          <p>{lesson.assignment}</p>
          <LessonProgressButton slug={lesson.slug} xp={lesson.xp} nextSlug={next?.slug}/>
        </section>

        {lesson.source?<p className="lesson-source">Интерфейс сверяется с материалом: <a href={lesson.source.url} target="_blank" rel="noreferrer">{lesson.source.label} ↗</a></p>:null}

        <nav className="lesson-next">
          {previous?<Link href={"/academy/"+previous.slug}><small>Предыдущий урок</small><b>← {previous.title}</b></Link>:<span/>}
          {next?<Link href={"/academy/"+next.slug}><small>Откроется после задания</small><b>{next.title} →</b></Link>:<Link href="/platform#academy"><small>Маршрут завершён</small><b>Вернуться в EDITA →</b></Link>}
        </nav>
      </div>

      <aside className="lesson-coach-column">
        <AiCoach
          compact
          scopeKey={"lesson:"+lesson.slug}
          title="AI рядом с уроком"
          welcome={"Я уже знаю, что ты проходишь урок «"+lesson.title+"». Скажи, на каком шаге застрял — объясню без выхода из урока."}
          prompts={lesson.prompts}
          context={{lessonSlug:lesson.slug,lessonTitle:lesson.title,lessonSummary:lesson.summary,lessonSteps:lesson.steps,editor:lesson.software,level:lesson.level}}
        />
      </aside>
    </div>
    </LessonRouteGate>
  </main>
}
