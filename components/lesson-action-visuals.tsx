import type {Lesson} from "@/lib/curriculum";
import {
  academyEditorReferences,
  type AcademyEditor,
  type ActionKey,
  type OperatingSystem,
} from "@/lib/academy-teaching";

type DiagramKind="flow"|"timeline"|"frame"|"levels"|"curve"|"layers"|"checklist";

type VisualSpec={
  title:string;
  kind:DiagramKind;
  labels:string[];
  correct:string;
  error:string;
  screen:string;
};

const visualSpecs={
  setup:{title:"Безопасный старт",kind:"flow",labels:["Официальный сайт","Папки проекта","Новый проект"],correct:"Установщик получен у разработчика, а проект сохранён отдельно от исходников.",error:"Установщик взят со случайного сайта или исходники лежат вперемешку с готовыми файлами.",screen:"стартовый экран программы, окно создания проекта и выбранная безопасная папка"},
  organize:{title:"Порядок файлов",kind:"checklist",labels:["01_Source","02_Project","03_Audio","04_Exports"],correct:"У каждого типа файла есть постоянная папка, которую не перемещают после импорта.",error:"Файлы переименованы или перемещены после добавления в проект.",screen:"проводник или Finder с четырьмя папками и панель файлов внутри проекта"},
  import:{title:"От исходника к ленте",kind:"flow",labels:["Папка исходников","Раздел Media / Project","Лента монтажа"],correct:"Файл появился в проекте и лежит на ленте без ошибки связи.",error:"Файл открыт для просмотра, но не добавлен в проект или на ленту.",screen:"панель файлов, окно просмотра и лента монтажа с первым клипом"},
  timeline:{title:"Три главные зоны",kind:"timeline",labels:["Клипы","Белая линия","Просмотр"],correct:"Выбран нужный клип, а белая линия стоит точно на проверяемом кадре.",error:"Изменяется другой клип или курсор стоит не в том месте.",screen:"общий экран проекта с панелью файлов, просмотром, лентой и выбранным клипом"},
  split:{title:"Чистая склейка",kind:"timeline",labels:["Фраза до","Лишний фрагмент","Фраза после"],correct:"Лишнее удалено, но начало и окончание слов сохранены.",error:"Разрез попал внутрь слова или после удаления осталась слышимая пауза.",screen:"лента крупным планом, курсор на точке разреза и выделенный удаляемый фрагмент"},
  reorder:{title:"Сильный кадр первым",kind:"timeline",labels:["Кадр C","Кадр A","Кадр B"],correct:"Самый понятный кадр открывает ролик, а клипы не перекрывают друг друга случайно.",error:"После перетаскивания появился пробел или клип оказался на другой дорожке.",screen:"лента до перестановки и та же лента после перемещения сильного кадра в начало"},
  ratio:{title:"Вертикальный кадр 9:16",kind:"frame",labels:["1080 × 1920","Безопасная зона","Проверка лица и текста"],correct:"Главный объект и подписи находятся внутри безопасной области вертикального кадра.",error:"Лицо или текст обрезаны либо закрываются кнопками социальной сети.",screen:"окно настроек проекта и вертикальный просмотр с видимыми границами кадра"},
  export:{title:"Проверяемый экспорт",kind:"checklist",labels:["H.264","1080 × 1920","FPS как в проекте","8–16 Мбит/с"],correct:"Готовый файл открывается вне редактора, начинается и заканчивается без ошибок.",error:"Проверен только проект, а созданный видеофайл не просмотрен.",screen:"окно экспорта со всеми выбранными параметрами и готовый файл в проигрывателе"},
  captions:{title:"Читаемые субтитры",kind:"frame",labels:["Не больше 2 строк","Высокий контраст","Безопасные поля"],correct:"Текст читается на телефоне и не закрывает лицо или важный объект.",error:"Субтитры слишком мелкие, длинные или стоят у самого края.",screen:"панель создания субтитров, выбранная строка и вертикальный просмотр с безопасными полями"},
  audio:{title:"Голос важнее музыки",kind:"levels",labels:["Голос — главный","Музыка — тише","Эффекты — коротко"],correct:"Каждое слово понятно и на тихом динамике, и в наушниках.",error:"Музыка маскирует окончания слов или индикатор уходит в перегруз.",screen:"звуковые дорожки, регулятор громкости выбранного клипа и индикатор уровня"},
  story:{title:"Понятная история",kind:"flow",labels:["Начало","Действие","Результат"],correct:"Зритель понимает тему в первые секунды и видит обещанный результат.",error:"Начало долгое, а главный смысл появляется слишком поздно.",screen:"лента с тремя подписанными смысловыми блоками и окно просмотра первого кадра"},
  broll:{title:"B-roll по смыслу",kind:"layers",labels:["V2 · дополнительный кадр","V1 · основная история","A1 · речь"],correct:"Дополнительный кадр показывает то, о чём сейчас говорит герой.",error:"B-roll закрывает важное действие или не связан с текущей фразой.",screen:"две видеодорожки и звуковая дорожка в месте появления дополнительного кадра"},
  transitions:{title:"Переход служит смыслу",kind:"timeline",labels:["Кадр A","Короткий переход","Кадр B"],correct:"Переход не задерживает историю и помогает связать подходящие кадры.",error:"Эффект заметнее содержания или используется между каждым клипом.",screen:"стык двух клипов до добавления перехода и после с видимой длительностью"},
  color:{title:"Сначала исправление, потом стиль",kind:"levels",labels:["Баланс белого","Экспозиция","Соседний кадр"],correct:"Белый выглядит нейтрально, кожа естественно, соседние кадры не скачут по яркости.",error:"Фильтр скрывает проблему, но белый и кожа остаются неестественными.",screen:"панель цветокоррекции, кадр до исправления и контрольный кадр после"},
  keyframes:{title:"Движение между двумя точками",kind:"curve",labels:["Ключ 1","Изменение","Ключ 2"],correct:"Движение начинается и заканчивается в нужных местах без резкого рывка.",error:"Ключи стоят в одной точке или движение начинается вне нужного фрагмента.",screen:"параметр Scale или Position, два ключевых кадра и видимая длительность движения"},
  overlay:{title:"Слой над основным видео",kind:"layers",labels:["V2 · наложение","V1 · основное видео","Безопасная область"],correct:"Наложение помогает объяснению и не закрывает лицо, подписи и главный объект.",error:"Верхний слой случайно закрывает весь кадр или важную информацию.",screen:"две видеодорожки, выбранный верхний клип и параметры Position, Scale и Opacity"},
  speed:{title:"Скорость меняется на движении",kind:"curve",labels:["1×","Ускорение","1×"],correct:"Изменение скорости поддерживает действие и не ломает речь.",error:"Скорость меняется внутри важного слова или создаёт заметные артефакты.",screen:"кривая или элементы управления скоростью и участок клипа с точками изменения"},
  mask:{title:"Видна только нужная часть",kind:"frame",labels:["Форма маски","Растушёвка края","Отслеживание"],correct:"Край выглядит чисто и следует за объектом на всём фрагменте.",error:"Маска срезает объект, дрожит или оставляет жёсткий край.",screen:"выбранный слой, контур маски в просмотре и параметры формы и растушёвки"},
  chroma:{title:"Чистый край без зелёного",kind:"frame",labels:["Выбор зелёного","Очистка края","Проверка на 2 фонах"],correct:"Волосы и полупрозрачные детали сохранены, зелёный ореол отсутствует.",error:"Слишком сильная настройка разрушила части объекта.",screen:"пипетка выбора фона, параметры keyer и результат на светлом и тёмном фоне"},
  multicam:{title:"Камеры синхронны",kind:"layers",labels:["Камера A","Камера B","Общий хлопок / звук"],correct:"Хлопок, губы и звук совпадают до переключения ракурсов.",error:"Ракурсы расходятся по времени после нескольких склеек.",screen:"два синхронизированных исходника, общая звуковая форма и мультикамерный просмотр"},
  repair:{title:"Диагностика до обработки",kind:"checklist",labels:["Дрожание","Шум речи","Свет и баланс","Переснять, если не спасти"],correct:"Исправление умеренное и не создаёт новых артефактов.",error:"Максимальная сила эффекта делает края плавающими, а голос — металлическим.",screen:"копия проблемного клипа, параметры обработки и сравнение с оригиналом"},
  client:{title:"Задание можно проверить",kind:"checklist",labels:["Цель и зритель","Формат и длительность","Срок и правки","Критерии готовности"],correct:"Обе стороны одинаково понимают результат, срок и число кругов правок.",error:"Формулировка «сделать красиво» осталась без примера и критериев.",screen:"безопасный демонстрационный бриф без имён, контактов и данных реального клиента"},
} satisfies Record<ActionKey,VisualSpec>;

const motionActions=new Set<ActionKey>(["import","split","reorder","transitions","keyframes","overlay","speed","mask","chroma","multicam"]);

const editorFileNames:Record<AcademyEditor,string>={
  "CapCut Desktop":"capcut-desktop",
  "Adobe Premiere Pro":"premiere-pro",
  "DaVinci Resolve":"davinci-resolve",
  "Final Cut Pro":"final-cut-pro",
};

function fileName(lesson:Lesson,editor:AcademyEditor,operatingSystem:OperatingSystem,action:ActionKey,index:number,extension="png"){
  const os=operatingSystem==="macOS"?"macos":"windows";
  return `${lesson.slug}-${editorFileNames[editor]}-${os}-${action}-step-${String(index+1).padStart(2,"0")}.${extension}`;
}

function ActionDiagram({spec,active}:{spec:VisualSpec;active:number}){
  return <div className={`action-diagram action-diagram-${spec.kind}`} role="img" aria-label={`${spec.title}: ${spec.labels.join(", ")}`}>
    {spec.labels.map((label,index)=><div className={index===active%spec.labels.length?"active":""} key={label}><i>{index+1}</i><b>{label}</b></div>)}
  </div>;
}

export default function LessonActionVisuals({
  lesson,
  editor,
  operatingSystem,
  action,
  steps,
  before,
  after,
}:{
  lesson:Lesson;
  editor:AcademyEditor;
  operatingSystem:OperatingSystem;
  action:ActionKey;
  steps:string[];
  before:string;
  after:string;
}){
  const spec=visualSpecs[action];
  const reference=academyEditorReferences[editor];
  const needsMotion=motionActions.has(action);

  return <section className="lesson-action-visuals" aria-labelledby={`visual-route-${lesson.slug}`}>
    <header>
      <div><div className="eyebrow">ВИЗУАЛЬНЫЙ МАРШРУТ ДЕЙСТВИЯ</div><h3 id={`visual-route-${lesson.slug}`}>{spec.title}</h3></div>
      <span className="visual-ready-badge">Схема готова</span>
    </header>
    <p className="visual-honesty-note"><b>Важно:</b> это точная схема принципа, а не выдуманный экран программы. Настоящие кнопки должны быть показаны только на проверенном снимке {editor} для {operatingSystem}.</p>

    <div className="visual-step-sequence">
      {steps.map((step,index)=><article className="visual-step-card" key={`${step}-${index}`}>
        <div className="visual-step-card-head"><span>ШАГ {index+1}</span><small>Схема + задание на снимок</small></div>
        <ActionDiagram spec={spec} active={index}/>
        <p>{step}</p>
        <details className="visual-capture-brief">
          <summary>Как снять точный экран для этого шага</summary>
          <dl>
            <div><dt>Программа</dt><dd>{editor}</dd></div>
            <div><dt>Система</dt><dd>{operatingSystem}</dd></div>
            <div><dt>Экран</dt><dd>{spec.screen}</dd></div>
            <div><dt>Действие</dt><dd>{step}</dd></div>
            <div><dt>Показать</dt><dd>состояние до действия, курсор или выделение нужной зоны и состояние после</dd></div>
            <div><dt>Скрыть</dt><dd>имя пользователя, путь к личной папке, недавние проекты, уведомления и данные аккаунта</dd></div>
            <div><dt>Файл</dt><dd><code>{fileName(lesson,editor,operatingSystem,action,index)}</code></dd></div>
            <div><dt>Формат</dt><dd>PNG, не ниже 1920 × 1080, оригинал без разметки</dd></div>
          </dl>
        </details>
      </article>)}
    </div>

    <div className="visual-result-check">
      <article className="wrong"><small>РАСПРОСТРАНЁННАЯ ОШИБКА</small><b>{before||spec.error}</b><p>{spec.error}</p></article>
      <article className="right"><small>ПРАВИЛЬНЫЙ РЕЗУЛЬТАТ</small><b>{after||spec.correct}</b><p>{spec.correct}</p></article>
    </div>

    <div className="visual-production-row">
      <div><span className="visual-status-dot pending"/><p><b>Реальные снимки ещё нужны.</b> До их получения схема остаётся честной заменой и не изображает несуществующие кнопки.</p></div>
      {needsMotion?<div><span className="visual-status-dot motion"/><p><b>Нужна демонстрация движения.</b> Запишите 5–15 секунд с паузой до действия и сохраните как <code>{fileName(lesson,editor,operatingSystem,action,0,"webm")}</code>.</p></div>:null}
      <div><span className="visual-status-dot source"/><p><b>Официальная сверка.</b> <a href={reference.url} target="_blank" rel="noreferrer">{reference.label} ↗</a><small>Проверено {reference.checkedAt}. {reference.versionNote}</small></p></div>
    </div>
  </section>;
}
