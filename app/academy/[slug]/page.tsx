import Link from "next/link";
import {notFound} from "next/navigation";
import AiCoach from "@/components/ai-coach";
import LessonProgressButton from "@/components/lesson-progress-button";
import LessonRouteGate from "@/components/lesson-route-gate";
import LessonVisual from "@/components/lesson-visual";
import LessonLearningPlan from "@/components/lesson-learning-plan";
import AuthGate from "@/components/auth-gate";
import LessonSoftwareAdapter from "@/components/lesson-software-adapter";
import {curriculum,lessonBySlug,optionalCurriculumModules,requiredCurriculum} from "@/lib/curriculum";

export default async function LessonPage({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const lesson=lessonBySlug(slug);
  if(!lesson)notFound();
  const curriculumIndex=curriculum.findIndex(item=>item.slug===slug);
  const requiredIndex=requiredCurriculum.findIndex(item=>item.slug===slug);
  const routeLessons=requiredIndex>=0?requiredCurriculum:optionalCurriculumModules.flatMap(group=>group.lessons);
  const routeIndex=routeLessons.findIndex(item=>item.slug===slug);
  const previous=routeIndex>0?routeLessons[routeIndex-1]:null;
  const next=routeIndex<routeLessons.length-1?routeLessons[routeIndex+1]:null;

  return <AuthGate><main className="lesson-shell-page">
    <nav className="lesson-topbar">
      <Link href="/platform#academy" className="brand">KIVRONIX<span>.</span></Link>
      <div className="lesson-top-actions"><Link href="/platform#academy" className="btn btn-ghost">← В Академию</Link><Link href="/platform#home" className="btn btn-ghost">В кабинет</Link></div>
    </nav>

    <header className="lesson-hero">
      <div className="lesson-count">{requiredIndex>=0?`${String(requiredIndex+1).padStart(2,"0")} / ${requiredCurriculum.length}`:`БИБЛИОТЕКА · ${String(routeIndex+1).padStart(2,"0")}`}</div>
      <div>
        <div className="eyebrow">{lesson.module}</div>
        <h1>{lesson.title}</h1>
        <p>{lesson.summary}</p>
        <div className="lesson-meta">
          <span>{lesson.level}</span><span>{lesson.minutes} минут</span><span>{lesson.software}</span><span>+{lesson.xp} опыта</span>
        </div>
      </div>
    </header>

    <LessonRouteGate requiredSlugs={curriculum.slice(0,curriculumIndex).map(item=>item.slug)} previousSlug={previous?.slug}>
    <LessonSoftwareAdapter lesson={lesson}/>
    <div className="lesson-layout">
      <div className="lesson-content">
        <section className="lesson-panel lesson-simple">
          <div className="eyebrow">ОБЪЯСНЕНИЕ БЕЗ СЛОЖНЫХ СЛОВ</div>
          <h2>Что это такое?</h2>
          <p className="lesson-lead">{lesson.simple}</p>
          <div className="lesson-example"><b>Пример</b><span>{lesson.example}</span></div>
        </section>

        <LessonLearningPlan lesson={lesson}/>

        <section className="lesson-panel lesson-visual-panel">
          <div className="eyebrow">ВИЗУАЛЬНАЯ КАРТА</div>
          <h2>{lesson.theoryOnly?"Посмотри и запомни главное":"Что ты увидишь на экране"}</h2>
          <LessonVisual lesson={lesson}/>
          {lesson.source?<div className="official-source-box"><div><b>{lesson.source.label}</b><span>Кнопки могут немного менять место после обновлений. Сверяй установку и названия с сайтом разработчика.</span></div><a className="btn btn-ghost" href={lesson.source.url} target="_blank" rel="noreferrer">Открыть официальный сайт ↗</a></div>:null}
        </section>

        {lesson.clicks?.length?<section className="lesson-panel">
          <div className="eyebrow">ПОШАГОВАЯ ПОДСКАЗКА</div>
          <h2>Куда нажать</h2>
          <p className="muted">Иди сверху вниз. Названия могут немного отличаться после обновления, но смысл каждой зоны остаётся тем же.</p>
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
          <div className="eyebrow">{lesson.theoryOnly?"РАЗБЕРЁМ ПО ПОРЯДКУ":"ДЕЛАЙ ВМЕСТЕ С УРОКОМ"}</div>
          <h2>{lesson.theoryOnly?"Как это работает":"По шагам"}</h2>
          <ol className="lesson-steps">{lesson.steps.map((step,itemIndex)=><li key={step}><span>{itemIndex+1}</span><p>{step}</p></li>)}</ol>
        </section>

        <section className="lesson-two-columns">
          <div className="lesson-panel checklist-panel"><h2>{lesson.theoryOnly?"После урока ты понимаешь":"Как понять, что готово"}</h2>{lesson.checklist.map(item=><p key={item}><span>✓</span>{item}</p>)}</div>
          <div className="lesson-panel mistakes-panel"><h2>{lesson.theoryOnly?"Важно различать":"Частые ошибки"}</h2>{lesson.mistakes.map(item=><p key={item}><span>!</span>{item}</p>)}</div>
        </section>

        <section className="lesson-panel lifehack-panel"><div className="lifehack-icon">⚡</div><div><div className="eyebrow">ПОЛЕЗНЫЙ СОВЕТ</div><h2>Сделай быстрее</h2><p>{lesson.lifehack}</p></div></section>

        <section className={"lesson-panel assignment-card "+(lesson.theoryOnly?"theory-completion-card":"")}>
          <div className="eyebrow">{lesson.theoryOnly?"ПРОВЕРКА ПОНИМАНИЯ":"САМОСТОЯТЕЛЬНАЯ ПРАКТИКА"}</div>
          <h2>{lesson.theoryOnly?"Объясни своими словами":"Теперь попробуй сам"}</h2>
          <p>{lesson.assignment}</p>
          <LessonProgressButton slug={lesson.slug} xp={lesson.xp} nextSlug={next?.slug} theoryOnly={lesson.theoryOnly}/>
        </section>

        <nav className="lesson-next">
          {previous?<Link href={"/academy/"+previous.slug}><small>Предыдущий урок</small><b>← {previous.title}</b></Link>:<span/>}
          {next?<Link href={"/academy/"+next.slug}><small>Откроется после завершения урока</small><b>{next.title} →</b></Link>:<Link href="/platform#academy"><small>Маршрут завершён</small><b>Вернуться в KIVRONIX →</b></Link>}
        </nav>
      </div>

      <aside className="lesson-coach-column">
        <AiCoach
          compact
          scopeKey={"lesson:"+lesson.slug}
          title="Помощник рядом с уроком"
          welcome={"Я уже знаю, что ты проходишь урок «"+lesson.title+"». Скажи, на каком шаге застрял — объясню без выхода из урока."}
          prompts={lesson.prompts}
          context={{lessonSlug:lesson.slug,lessonTitle:lesson.title,lessonSummary:lesson.summary,lessonSteps:lesson.steps,editor:lesson.software,level:lesson.level}}
        />
      </aside>
    </div>
    </LessonRouteGate>
  </main></AuthGate>
}
