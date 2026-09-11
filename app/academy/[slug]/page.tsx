import Link from "next/link";
import { notFound } from "next/navigation";
import { lessonBySlug } from "@/lib/curriculum";

export default async function LessonPage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const lesson=lessonBySlug(slug);
  if(!lesson) notFound();

  return <main className="legal-page">
    <div className="legal-shell lesson-page">
      <Link href="/platform" className="brand">EDITA<span>.</span></Link>
      <div className="eyebrow">{lesson.module} · +{lesson.xp} XP</div>
      <h1>{lesson.title}</h1>
      <p>{lesson.summary}</p>

      <section className="legal-card lesson-simple">
        <div className="eyebrow">ОБЪЯСНЕНИЕ БЕЗ СЛОЖНЫХ СЛОВ</div>
        <h2>Что это такое?</h2>
        <p>{lesson.simple}</p>
        <div className="lesson-example"><b>Пример:</b><span>{lesson.example}</span></div>
      </section>

      {lesson.words?.length?<section className="legal-card">
        <h2>Слова, которые пригодятся</h2>
        <div className="word-list">
          {lesson.words.map(item=><div className="word-row" key={item.term}><b>{item.term}</b><span>{item.meaning}</span></div>)}
        </div>
      </section>:null}

      <section className="legal-card">
        <h2>Что делать по шагам</h2>
        <ol className="lesson-steps">
          {lesson.steps.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}
        </ol>
      </section>

      <section className="legal-card assignment-card">
        <div className="eyebrow">МАЛЕНЬКАЯ ПРАКТИКА</div>
        <h2>Попробуй сам</h2>
        <p>{lesson.assignment}</p>
        <p className="muted">Если что-то непонятно, вернись в EDITA → AI Coach и напиши: «Объясни мне этот урок ещё проще».</p>
        <Link className="btn btn-dark" href="/platform">Вернуться в Академию</Link>
      </section>
    </div>
  </main>
}
