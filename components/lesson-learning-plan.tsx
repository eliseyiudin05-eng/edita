import type {Lesson} from "@/lib/curriculum";
import {lessonTeachingPlan} from "@/lib/academy-teaching";

export default function LessonLearningPlan({lesson}:{lesson:Lesson}){
  const plan=lessonTeachingPlan(lesson);
  return <>
    <section className="lesson-panel lesson-contract">
      <div className="eyebrow">МАРШРУТ УРОКА</div>
      <h2>Что сделаем и как проверим</h2>
      <div className="lesson-contract-grid">
        <article><small>ЗАЧЕМ</small><p>{plan.purpose}</p></article>
        <article><small>ДО НАЧАЛА</small><p>{plan.prerequisite}</p></article>
        <article><small>РЕЗУЛЬТАТ</small><p>{plan.result}</p></article>
        <article><small>ЧТО ПОДГОТОВИТЬ</small><p>{plan.assets}</p></article>
      </div>
    </section>

    <section className="lesson-panel lesson-practice-cycle">
      <div className="eyebrow">ОБЪЯСНЕНИЕ → ПОКАЗ → ПРАКТИКА → ПРОВЕРКА</div>
      <h2>Сначала вместе, затем самостоятельно</h2>
      <div className="practice-cycle-grid">
        <article><span>1</span><div><b>Показ с преподавателем</b><ol>{plan.guidedAction.map(item=><li key={item}>{item}</li>)}</ol></div></article>
        <article><span>2</span><div><b>Твоя самостоятельная работа</b><p>{plan.independentAction}</p></div></article>
        <article><span>3</span><div><b>Критерии готовности</b><ul>{plan.technicalRequirements.map(item=><li key={item}>{item}</li>)}</ul></div></article>
        <article><span>4</span><div><b>Если не получилось</b><ul>{plan.failReasons.map(item=><li key={item}>{item}</li>)}</ul></div></article>
      </div>
      <p className="lesson-supportive-line">{plan.encouragement}</p>
    </section>
  </>;
}
