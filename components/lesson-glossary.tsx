import type {Lesson} from "@/lib/curriculum";
import {glossaryForLesson} from "@/lib/editing-glossary";

export default function LessonGlossary({lesson}:{lesson:Lesson}){
  const entries=glossaryForLesson(lesson);
  if(!entries.length)return null;
  return <section className="lesson-panel lesson-glossary">
    <div className="eyebrow">СЛОВАРЬ УРОКА</div>
    <h2>Нажми на термин, чтобы понять его</h2>
    <p className="muted">Официальное английское название сохранено рядом с понятным русским вариантом.</p>
    <div className="lesson-glossary-grid">{entries.map(entry=><details key={entry.english}>
      <summary><span>{entry.russian}</span><small>{entry.english}</small></summary>
      <p>{entry.explanation}</p>
      <dl><div><dt>Пример</dt><dd>{entry.example}</dd></div><div><dt>Где встречается</dt><dd>{entry.programs}</dd></div><div><dt>Частая ошибка</dt><dd>{entry.commonMistake}</dd></div></dl>
    </details>)}</div>
  </section>;
}
