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

      <section className="legal-card">
        <h2>Как делать</h2>
        <ol className="lesson-steps">
          {lesson.steps.map((step,i)=><li key={i}><span>{i+1}</span><p>{step}</p></li>)}
        </ol>
      </section>

      <section className="legal-card assignment-card">
        <div className="eyebrow">ПРАКТИКА</div>
        <h2>Задание</h2>
        <p>{lesson.assignment}</p>
        <Link className="btn btn-dark" href="/platform">Вернуться и отметить урок</Link>
      </section>
    </div>
  </main>
}
