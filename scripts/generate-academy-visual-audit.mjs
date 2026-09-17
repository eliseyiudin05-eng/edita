import {writeFile} from "node:fs/promises";
import {curriculum} from "../lib/curriculum.ts";
import {
  academyEditorOptions,
  academyEditorReferences,
  actionFor,
  editorInstruction,
} from "../lib/academy-teaching.ts";

const checkedAt="17.09.2026";
const motionActions=new Set(["import","split","reorder","transitions","keyframes","overlay","speed","mask","chroma","multicam"]);

function escapeCell(value){
  return String(value).replaceAll("|","\\|").replaceAll("\n"," ");
}

function existingReference(lesson){
  const software=lesson.software.toLocaleLowerCase("ru-RU");
  if(software.includes("capcut"))return "Есть справочный кадр CapCut; точный снимок версии не подтверждён";
  if(software.includes("davinci"))return "Есть устаревший кадр Resolve 17.3; текущая версия 21";
  if(software.includes("final cut"))return "Есть официальный справочный кадр Apple; нужен собственный пошаговый снимок";
  if(software.includes("premiere")||software.includes("after effects"))return "Сторонний кадр заблокирован для публикации";
  if(software.includes("vn")||software.includes("inshot")||software.includes("canva"))return "Есть справочный маркетинговый кадр; точный шаг не подтверждён";
  return "Нет точного снимка интерфейса";
}

function sourceFor(lesson){
  if(lesson.source)return `[${lesson.source.label}](${lesson.source.url})`;
  return lesson.theoryOnly?"Собственная схема KIVRONIX":"Официальная справка выбранного редактора + собственный безопасный снимок";
}

const practical=curriculum.filter(lesson=>!lesson.theoryOnly);
const guidedFrames=practical.reduce((total,lesson)=>total+editorInstruction(lesson,"CapCut Desktop","Windows").steps.length,0);
const motionLessons=practical.filter(lesson=>motionActions.has(actionFor(lesson))).length;
const variants=academyEditorOptions.reduce((total,editor)=>total+editor.systems.length,0);

const rows=curriculum.map((lesson,index)=>{
  const action=actionFor(lesson);
  const instructionCount=lesson.theoryOnly?lesson.steps.length:editorInstruction(lesson,"CapCut Desktop","Windows").steps.length;
  const material=lesson.theoryOnly
    ?"HTML/CSS-схема главной мысли"
    :`Схема действия + ${instructionCount} задания на пошаговые снимки${motionActions.has(action)?" + короткий WebM":""}`;
  const method=lesson.theoryOnly
    ?"Собственная точная схема"
    :"Схема готова; реальный интерфейс — собственный скриншот или разрешённый официальный материал";
  const status=lesson.theoryOnly
    ?"готово: схема"
    :motionActions.has(action)
      ?"нужны реальные скриншоты и видеодемонстрация"
      :"нужны реальные скриншоты";
  return `| ${String(index+1).padStart(2,"0")} · ${escapeCell(lesson.title)} | ${escapeCell(action)} | ${escapeCell(lesson.software)} | ${escapeCell(material)} | ${escapeCell(existingReference(lesson))} | ${escapeCell(method)} | ${escapeCell(status)} |`;
});

const sourceRows=academyEditorOptions.map(editor=>{
  const source=academyEditorReferences[editor.value];
  return `| ${editor.label} | ${editor.systems.join(", ")} | [${source.label}](${source.url}) | ${source.versionNote} | ${source.checkedAt} |`;
});

const report=`# Инвентаризация визуальных материалов Академии KIVRONIX

Проверено: **${checkedAt}**. Ветка: **test-production**.

## Итог проверки

- Уроков: **${curriculum.length}**.
- Теоретических уроков: **${curriculum.length-practical.length}**.
- Практических уроков: **${practical.length}**.
- Универсальных типов точных схем: **22**.
- Пошаговых визуальных карточек в одном выбранном маршруте: **${guidedFrames}**.
- Уроков, где движение лучше показать WebM: **${motionLessons}**.
- Обязательных сочетаний редактор / система: **${variants}**.
- Доступные программы в среде сборки: **нет**; Linux работает без графического интерфейса.
- Поэтому ни один экран CapCut, Premiere Pro, DaVinci Resolve или Final Cut Pro не был выдуман или подписан как проверенный.

## Поддерживаемые редакторы и официальная сверка

| Редактор | Системы | Официальный источник | Версия / ограничение | Проверено |
| --- | --- | --- | --- | --- |
${sourceRows.join("\n")}

## Полная таблица уроков

| Урок | Действие | Программа | Необходимый материал | Материал уже есть | Способ получения | Статус |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## Что уже интегрировано

1. В каждом практическом уроке показывается точная универсальная схема действия.
2. Каждый шаг получил отдельную визуальную карточку и раскрываемое техническое задание на реальный снимок.
3. Для задания указаны программа, система, экран, действие, состояния до и после, требования к приватности, размер, формат и имя файла.
4. Для динамических действий отдельно формируется задание на короткий WebM.
5. В уроке есть сравнение распространённой ошибки и правильного результата.
6. Сторонние кадры Premiere Pro и After Effects больше не выдаются за готовую инструкцию.
7. DaVinci Resolve 17.3 явно помечен как устаревший относительно текущей версии 21.

## Что требуется от владельца проекта

Нужны безопасные скриншоты из фактически установленных редакторов. Для каждого
шага точное задание уже находится внутри урока. Сначала достаточно снять первые
пять практических уроков для одного основного сочетания редактор / система,
проверить стиль разметки и только затем масштабировать съёмку на остальные
варианты.
`;

await writeFile(new URL("../docs/academy-visual-audit.md",import.meta.url),report,"utf8");
console.log(`Создан docs/academy-visual-audit.md: ${curriculum.length} уроков, ${guidedFrames} пошаговых карточек.`);
