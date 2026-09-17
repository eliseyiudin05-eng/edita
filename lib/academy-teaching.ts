import type {Lesson} from "@/lib/curriculum";

export const academyEditorOptions=[
  {value:"CapCut Desktop",label:"CapCut Desktop",systems:["Windows","macOS"]},
  {value:"Adobe Premiere Pro",label:"Adobe Premiere Pro",systems:["Windows","macOS"]},
  {value:"DaVinci Resolve",label:"DaVinci Resolve",systems:["Windows","macOS"]},
  {value:"Final Cut Pro",label:"Final Cut Pro",systems:["macOS"]},
] as const;

export type AcademyEditor=(typeof academyEditorOptions)[number]["value"];
export type OperatingSystem="Windows"|"macOS";

export function normalizeAcademyEditor(value:unknown):AcademyEditor{
  const text=String(value||"").trim().toLocaleLowerCase("ru-RU");
  if(text.includes("premiere"))return "Adobe Premiere Pro";
  if(text.includes("davinci"))return "DaVinci Resolve";
  if(text.includes("final cut"))return "Final Cut Pro";
  return "CapCut Desktop";
}

export function normalizeOperatingSystem(value:unknown,editor?:AcademyEditor):OperatingSystem{
  if(editor==="Final Cut Pro")return "macOS";
  return String(value||"").toLocaleLowerCase("ru-RU").includes("mac")?"macOS":"Windows";
}

export type ActionKey=
  |"setup"|"organize"|"import"|"timeline"|"split"|"reorder"|"ratio"|"export"
  |"captions"|"audio"|"story"|"broll"|"transitions"|"color"|"keyframes"
  |"overlay"|"speed"|"mask"|"chroma"|"multicam"|"repair"|"client";

type EditorUi={
  media:string;
  timeline:string;
  inspector:string;
  split:string;
  splitShortcut:string;
  captions:string;
  audio:string;
  ratio:string;
  export:string;
  keyframes:string;
  mask:string;
  chroma:string;
  color:string;
  speed:string;
  multicam:string;
  stabilize:string;
  noiseReduction:string;
};

const ui:Record<AcademyEditor,EditorUi>={
  "CapCut Desktop":{
    media:"Media → Import",timeline:"Timeline",inspector:"Video / Audio справа",split:"Split",splitShortcut:"Ctrl+B (Windows) / Cmd+B (macOS)",
    captions:"Text → Auto captions",audio:"Audio и вкладка Basic → Volume",ratio:"Ratio → 9:16",export:"Export в правом верхнем углу",
    keyframes:"ромб Keyframe рядом с параметром",mask:"Video → Mask",chroma:"Video → Remove BG → Chroma key",color:"Adjustment",speed:"Speed → Normal / Curve",multicam:"несколько синхронизированных дорожек на Timeline",stabilize:"Video → Basic → Stabilize",noiseReduction:"Audio → Reduce noise",
  },
  "Adobe Premiere Pro":{
    media:"File → Import / панель Project",timeline:"панель Timeline",inspector:"Window → Effect Controls / Properties",split:"Add Edit или Razor Tool",splitShortcut:"Ctrl+K (Windows) / Cmd+K (macOS)",
    captions:"Window → Text → Transcript → Create captions",audio:"Window → Essential Sound / Audio Track Mixer",ratio:"Sequence Settings → 1080 × 1920",export:"File → Export → Media",
    keyframes:"секундомер Toggle Animation в Effect Controls",mask:"Opacity → Ellipse / Rectangle / Pen",chroma:"Effects → Ultra Key",color:"Window → Lumetri Color",speed:"Speed/Duration / Time Remapping",multicam:"Multi-Camera Source Sequence",stabilize:"Effects → Warp Stabilizer",noiseReduction:"Essential Sound → Repair → Reduce Noise",
  },
  "DaVinci Resolve":{
    media:"File → Import → Media / Media Pool",timeline:"страница Edit → Timeline",inspector:"Inspector справа",split:"Blade Edit Mode или Split Clip",splitShortcut:"Ctrl+B (Windows) / Cmd+B (macOS)",
    captions:"Timeline → Create Subtitles from Audio",audio:"Fairlight / Inspector → Audio",ratio:"Project Settings → Timeline resolution → 1080 × 1920",export:"страница Deliver → Add to Render Queue",
    keyframes:"ромб Keyframe в Inspector",mask:"Color → Window или Fusion → Polygon",chroma:"Fusion → Delta Keyer / Color → 3D Keyer",color:"страница Color",speed:"Retime Controls / Retime Curve",multicam:"Create New Multicam Clip Using Selected Clips",stabilize:"Inspector → Video → Stabilization",noiseReduction:"Fairlight → Voice Isolation / Noise Reduction",
  },
  "Final Cut Pro":{
    media:"File → Import → Media / Browser",timeline:"Magnetic Timeline",inspector:"Window → Show in Workspace → Inspector",split:"Blade",splitShortcut:"Cmd+B",
    captions:"Edit → Captions → Add Caption (автораспознавание зависит от версии и региона)",audio:"Audio Inspector → Volume",ratio:"Project Properties → Modify → Vertical",export:"File → Share → Export File",
    keyframes:"ромб Add a Keyframe в Video Inspector",mask:"Effects → Masks → Draw Mask / Shape Mask",chroma:"Effects → Keying → Keyer",color:"Color Inspector",speed:"Retime menu",multicam:"File → New → Multicam Clip",stabilize:"Video Inspector → Stabilization",noiseReduction:"Audio Inspector → Voice Isolation / Noise Removal",
  },
};

export const academyEditorReferences:Record<AcademyEditor,{label:string;url:string;checkedAt:string;versionNote:string}>={
  "CapCut Desktop":{
    label:"Официальное руководство CapCut для компьютера",
    url:"https://www.capcut.com/resource/capcut-tutorial-for-beginners",
    checkedAt:"17.09.2026",
    versionNote:"CapCut не указывает номер версии в руководстве; расположение элементов нужно подтвердить снимком установленной версии.",
  },
  "Adobe Premiere Pro":{
    label:"Официальные уроки Adobe Premiere",
    url:"https://www.adobe.com/learn/premiere-pro",
    checkedAt:"17.09.2026",
    versionNote:"Adobe обновляет уроки без единого номера интерфейса; снимок нужно делать в фактически установленной версии.",
  },
  "DaVinci Resolve":{
    label:"Официальное обучение Blackmagic Design",
    url:"https://www.blackmagicdesign.com/products/davinciresolve/training",
    checkedAt:"17.09.2026",
    versionNote:"На странице доступен DaVinci Resolve 21, а часть официальных учебников пока относится к Resolve 20.",
  },
  "Final Cut Pro":{
    label:"Актуальное руководство Apple Final Cut Pro",
    url:"https://support.apple.com/guide/final-cut-pro/welcome/mac",
    checkedAt:"17.09.2026",
    versionNote:"Руководство Apple обновляется вместе с программой; точный экран всё равно нужно подтвердить на используемом Mac.",
  },
};

const actionBySlug:Record<string,ActionKey>={
  "start-without-fear":"story","what-is-editing":"story","first-10k-path":"client","editor-words":"timeline","first-reel-plan":"setup",
  "capcut-install":"setup","capcut-new-project":"import","capcut-timeline":"timeline","capcut-first-split":"split","capcut-reorder":"reorder",
  "capcut-format-vertical":"ratio","video-settings-basics":"export","capcut-clean-cut":"split","capcut-auto-captions":"captions","capcut-music":"audio","capcut-first-export":"export",
  "short-form-formats":"story","hook-basics":"story","story-basics":"story","shoot-for-edit":"story","b-roll":"broll","retention-basics":"story","subtitle-design":"captions","transitions":"transitions","music-rhythm":"audio","loop-ending":"story","cover-and-title":"captions",
  "voice-music-sfx":"audio","color-basics":"color","rescue-footage":"repair","keyframes":"keyframes","overlays":"overlay","speed-control":"speed","accessible-video":"captions","copyright-basics":"audio",
  "capcut-desktop-install":"setup","capcut-desktop":"timeline","vn-install":"setup","vn-first-project":"timeline","inshot-install":"setup","inshot-first-project":"timeline",
  "premiere-install":"setup","premiere-first-project":"timeline","davinci-install":"setup","davinci-first-project":"timeline","final-cut-install":"setup","final-cut-first-project":"timeline",
  "canva-install":"setup","canva-video":"captions","after-effects-install":"setup","after-effects-first-project":"timeline",
  "masking":"mask","chroma-key":"chroma","advanced-color":"color","sound-design":"audio","multicam":"multicam",
  "client-brief":"client","pricing":"client","revision-system":"client","portfolio":"client","analytics":"client","style-first-orders":"client","final-project":"client",
};

export function actionFor(lesson:Lesson):ActionKey{
  return actionBySlug[lesson.slug]||(!lesson.theoryOnly?"timeline":"story");
}

function shortcut(uiValue:EditorUi,os:OperatingSystem){
  return uiValue.splitShortcut.replace(" (Windows)","").replace(" (macOS)","").split(" / ")[os==="macOS"?1:0]||uiValue.splitShortcut;
}

export function editorInstruction(lesson:Lesson,editor:AcademyEditor,os:OperatingSystem){
  const item=ui[editor];
  const action=actionFor(lesson);
  const common=`Открой проект в ${editor} на ${os}. Сначала сохрани отдельную версию проекта, затем выполни действие и посмотри 2 секунды до и после изменения.`;
  const directions:Record<ActionKey,string[]>={
    setup:[`Скачай ${editor} только с официального сайта разработчика.`,"Создай папки 01_Source, 02_Project, 03_Audio и 04_Exports.",`Создай новый проект и сразу сохрани его в 02_Project. ${editor==="Final Cut Pro"?"Для Final Cut Pro нужен Mac.":"Не меняй системные папки программы."}`],
    organize:["Скопируй исходники в 01_Source до импорта.","Не переименовывай и не перемещай файлы после импорта.","Версии проекта называй project_v01, project_v02 и project_final только после проверки."],
    import:[`${item.media}: выбери 3–5 исходников из 01_Source.`,"Разложи речь, B-roll, музыку и графику по отдельным папкам или коллекциям внутри проекта.",`Перетащи выбранные клипы в ${item.timeline} и один раз посмотри их без монтажа.`],
    timeline:[`${item.media}: найди исходники; затем открой ${item.timeline}.`,`Поставь курсор воспроизведения в нужный момент и проверь кадр в Viewer / Program Monitor.`,`Параметры выбранного клипа находятся здесь: ${item.inspector}.`],
    split:[`Поставь курсор перед лишним фрагментом и выполни ${item.split} (${shortcut(item,os)}).`,`Сделай второй разрез после лишнего фрагмента, выдели середину и удали её.`,"Прослушай стык: начало и конец слов должны остаться целыми."],
    reorder:[`В ${item.timeline} выдели самый сильный кадр.`,"Перетащи его в начало, не накладывая случайно поверх соседнего клипа.","Сравни две версии первых трёх секунд и оставь более ясную."],
    ratio:[`${item.ratio}.`,`Проверь разрешение 1080 × 1920 и частоту кадров проекта по исходнику.`,`В ${item.inspector} поправь Scale / Position, чтобы лицо и текст не попали под интерфейс соцсети.`],
    export:[`${item.export}.`,"Выбери H.264, 1080 × 1920 и ту же частоту кадров, что у проекта; для первого ролика обычно достаточно 8–16 Мбит/с.","Открой готовый файл вне редактора и проверь начало, конец, звук, субтитры и отсутствие чёрных полей."],
    captions:[`${item.captions}.`,"Выбери язык речи, создай подписи и вручную проверь имена, числа и окончания.",`Настрой шрифт и положение через ${item.inspector}; оставь не более двух строк и безопасные поля.`],
    audio:[`${item.audio}.`,"Сначала выровняй голос, затем подложи музыку и убавь её до уверенной разборчивости речи.","Проверь в наушниках и через тихий динамик; на финале сделай короткое затухание."],
    story:["Запиши одним предложением: зритель → проблема → обещанный результат.",`Собери черновую последовательность в ${item.timeline} без эффектов.`,"Покажи первые две секунды отдельно и проверь, понятна ли тема без объяснений."],
    broll:[`${item.media}: собери отдельную папку / коллекцию B-roll.`,`Положи B-roll на дорожку над основной историей в ${item.timeline}.`,"Каждый дополнительный кадр должен показывать то, о чём сейчас говорится, а не просто закрывать склейку."],
    transitions:[`Найди Transitions / Video Transitions и добавь один переход только между подходящими кадрами.`,"Сократи длительность перехода, чтобы он не задерживал историю.","Сравни с обычной склейкой: оставь переход, только если смысл стал понятнее."],
    color:[`${item.color}.`,"Сначала исправь баланс белого и экспозицию, затем выровняй соседние кадры.","Проверь кожу и белые объекты; стиль добавляй только после технической коррекции."],
    keyframes:[`${item.keyframes}.`,"Поставь первый ключ в начале движения, измени Scale / Position позже и поставь второй.","Просмотри движение в реальном времени и смягчи его кривой Ease, если программа это поддерживает."],
    overlay:[`Положи второй клип над основным в ${item.timeline}.`,`Через ${item.inspector} измени Position, Scale и при необходимости Opacity.`,"Проверь, что наложение не закрывает лицо, субтитры и главный объект."],
    speed:[`${item.speed}.`,"Поставь изменение скорости на движении, а не внутри важного слова.","Просмотри стык со звуком; при артефактах уменьши изменение или замени кадр."],
    mask:[`${item.mask}.`,"Создай простую форму вокруг объекта, настрой Feather / растушёвку.",`Если объект движется, добавь ключевые кадры через ${item.keyframes} и проверь каждый сложный участок.`],
    chroma:[`${item.chroma}.`,"Выбери цвет фона пипеткой, затем очищай край параметрами tolerance / spill, не разрушая объект.","Проверь волосы, полупрозрачные детали и край на светлом и тёмном фоне."],
    multicam:[`${item.multicam}.`,"Синхронизируй камеры по звуку или таймкоду и проверь совпадение хлопка / согласной.","Сначала собери смысл по главной камере, затем переключай ракурсы только по действию или смыслу."],
    repair:["Сделай копию проблемного клипа и сравнивай с оригиналом.",`Дрожание: ${item.stabilize}. Повышай силу постепенно и остановись, если края начали плыть.`,`Шум речи: ${item.noiseReduction}. Обрабатывай умеренно, затем подравняй экспозицию и баланс белого в ${item.color}.`,"Если лицо, слова или действие нельзя спасти без артефактов, замени кадр или пересними его."],
    client:["Зафиксируй цель, зрителя, площадку, формат, длительность, срок и число кругов правок.","Разбей результат на проверяемые критерии и согласуй их письменно до монтажа.","Перед отправкой проверь смысл, технику и требования к файлу отдельными просмотрами."],
  };
  return {action,common,steps:directions[action]};
}

export function toolEquivalence(lesson:Lesson){
  const action=actionFor(lesson);
  const rows:Record<ActionKey,{goal:string;values:Record<AcademyEditor,string>}[]>={
    setup:[{goal:"Новый проект",values:{"CapCut Desktop":"New project","Adobe Premiere Pro":"New Project","DaVinci Resolve":"New Project","Final Cut Pro":"New Library → New Project"}}],
    organize:[{goal:"Файлы проекта",values:{"CapCut Desktop":"Local / Media","Adobe Premiere Pro":"Project bins","DaVinci Resolve":"Media Pool bins","Final Cut Pro":"Library / Event"}}],
    import:[{goal:"Импорт",values:{"CapCut Desktop":"Media → Import","Adobe Premiere Pro":"File → Import","DaVinci Resolve":"File → Import → Media","Final Cut Pro":"File → Import → Media"}}],
    timeline:[{goal:"Лента монтажа",values:{"CapCut Desktop":"Timeline","Adobe Premiere Pro":"Timeline","DaVinci Resolve":"Edit Timeline","Final Cut Pro":"Magnetic Timeline"}}],
    split:[{goal:"Разрез",values:{"CapCut Desktop":"Split · Ctrl/Cmd+B","Adobe Premiere Pro":"Add Edit · Ctrl/Cmd+K","DaVinci Resolve":"Split Clip · Ctrl/Cmd+B","Final Cut Pro":"Blade · Cmd+B"}}],
    reorder:[{goal:"Переставить",values:{"CapCut Desktop":"Drag on Timeline","Adobe Premiere Pro":"Selection Tool · V","DaVinci Resolve":"Selection Mode · A","Final Cut Pro":"Drag in Magnetic Timeline"}}],
    ratio:[{goal:"Вертикальный кадр",values:{"CapCut Desktop":"Ratio → 9:16","Adobe Premiere Pro":"Sequence Settings","DaVinci Resolve":"Project Settings","Final Cut Pro":"Modify Project → Vertical"}}],
    export:[{goal:"Готовый файл",values:{"CapCut Desktop":"Export","Adobe Premiere Pro":"Export → Media","DaVinci Resolve":"Deliver","Final Cut Pro":"Share → Export File"}}],
    captions:[{goal:"Субтитры",values:{"CapCut Desktop":"Text → Auto captions","Adobe Premiere Pro":"Text → Transcript","DaVinci Resolve":"Create Subtitles from Audio","Final Cut Pro":"Edit → Captions"}}],
    audio:[{goal:"Громкость",values:{"CapCut Desktop":"Audio → Volume","Adobe Premiere Pro":"Essential Sound","DaVinci Resolve":"Fairlight","Final Cut Pro":"Audio Inspector"}}],
    story:[{goal:"Черновая сборка",values:{"CapCut Desktop":"Timeline","Adobe Premiere Pro":"Sequence","DaVinci Resolve":"Edit Timeline","Final Cut Pro":"Project Timeline"}}],
    broll:[{goal:"B-roll над речью",values:{"CapCut Desktop":"Upper video track","Adobe Premiere Pro":"Video Track V2","DaVinci Resolve":"Video Track 2","Final Cut Pro":"Connected Clip"}}],
    transitions:[{goal:"Переход",values:{"CapCut Desktop":"Transitions","Adobe Premiere Pro":"Video Transitions","DaVinci Resolve":"Video Transitions","Final Cut Pro":"Transitions Browser"}}],
    color:[{goal:"Цвет",values:{"CapCut Desktop":"Adjustment","Adobe Premiere Pro":"Lumetri Color","DaVinci Resolve":"Color page","Final Cut Pro":"Color Inspector"}}],
    keyframes:[{goal:"Ключевой кадр",values:{"CapCut Desktop":"Keyframe diamond","Adobe Premiere Pro":"Toggle Animation","DaVinci Resolve":"Inspector keyframe","Final Cut Pro":"Add a Keyframe"}}],
    overlay:[{goal:"Наложение",values:{"CapCut Desktop":"Upper track","Adobe Premiere Pro":"V2 / V3","DaVinci Resolve":"Video Track 2","Final Cut Pro":"Connected Clip"}}],
    speed:[{goal:"Скорость",values:{"CapCut Desktop":"Speed","Adobe Premiere Pro":"Speed/Duration","DaVinci Resolve":"Retime Controls","Final Cut Pro":"Retime"}}],
    mask:[{goal:"Маска",values:{"CapCut Desktop":"Video → Mask","Adobe Premiere Pro":"Opacity Mask","DaVinci Resolve":"Power Window / Polygon","Final Cut Pro":"Draw Mask"}}],
    chroma:[{goal:"Хромакей",values:{"CapCut Desktop":"Chroma key","Adobe Premiere Pro":"Ultra Key","DaVinci Resolve":"3D Keyer / Delta Keyer","Final Cut Pro":"Keyer"}}],
    multicam:[{goal:"Мультикам",values:{"CapCut Desktop":"Synced tracks","Adobe Premiere Pro":"Multi-Camera Source Sequence","DaVinci Resolve":"Multicam Clip","Final Cut Pro":"New Multicam Clip"}}],
    repair:[
      {goal:"Стабилизация",values:{"CapCut Desktop":"Video → Stabilize","Adobe Premiere Pro":"Warp Stabilizer","DaVinci Resolve":"Inspector → Stabilization","Final Cut Pro":"Video Inspector → Stabilization"}},
      {goal:"Шум в речи",values:{"CapCut Desktop":"Reduce noise","Adobe Premiere Pro":"Essential Sound → Reduce Noise","DaVinci Resolve":"Fairlight → Voice Isolation","Final Cut Pro":"Audio Inspector → Voice Isolation"}},
      {goal:"Свет и белый",values:{"CapCut Desktop":"Adjustment","Adobe Premiere Pro":"Lumetri Color","DaVinci Resolve":"Color page","Final Cut Pro":"Color Inspector"}},
    ],
    client:[{goal:"Фиксация задачи",values:{"CapCut Desktop":"Project notes / документ","Adobe Premiere Pro":"Project notes / документ","DaVinci Resolve":"Clip notes / документ","Final Cut Pro":"Notes / документ"}}],
  };
  return rows[action];
}

export type LessonQuizQuestion={
  question:string;
  answers:string[];
  correct:number;
  explanation:string;
};

function rotatedQuestion(question:string,correctAnswer:string,distractors:[string,string],rotation:number,explanation:string):LessonQuizQuestion{
  const answers=[correctAnswer,...distractors];
  const shift=((rotation%3)+3)%3;
  const rotated=answers.map((_,index)=>answers[(index+shift)%3]);
  return {question,answers:rotated,correct:rotated.indexOf(correctAnswer),explanation};
}

export function lessonQuiz(lesson:Lesson):LessonQuizQuestion[]{
  const seed=Array.from(lesson.slug).reduce((sum,char)=>sum+char.charCodeAt(0),0);
  const success=lesson.checklist[0]||"Результат проверен по чек-листу";
  const mistake=lesson.mistakes[0]||"Пропустить проверку результата";
  const practice=lesson.assignment;
  return [
    rotatedQuestion("Какой результат показывает, что навык этого урока получился?",success,[mistake,"Добавлено как можно больше эффектов"],seed,`Верный ориентир — «${success}». Он напрямую связан с результатом урока.`),
    rotatedQuestion("Какое действие здесь чаще всего ухудшает результат?",mistake,["Сравнить две версии","Проверить работу по чек-листу"],seed+1,`В уроке отдельно разобрана ошибка: «${mistake}». Сначала исправь её, затем усложняй монтаж.`),
    rotatedQuestion("Что нужно сделать самостоятельно после показа преподавателя?",practice,["Только перечитать теорию","Сразу перейти к следующему уроку"],seed+2,"Навык закрепляется самостоятельным действием, а не просмотром объяснения."),
  ];
}

const videoProofSlugs=new Set(["capcut-first-export","accessible-video","final-project"]);

export function lessonCompletionRules(lesson:Lesson){
  const videoRequired=videoProofSlugs.has(lesson.slug);
  return {
    quizRequired:2,
    noteMinimum:20,
    videoRequired,
    reviewMinimum:videoRequired?60:0,
    evidenceLabel:lesson.theoryOnly
      ?"Напиши 1–2 предложения своими словами: что ты понял и где применишь это в ролике."
      :"Опиши конкретно, что изменил, что проверил и какой результат получил (минимум 20 символов).",
  };
}

const encouragement=[
  "Не стремись сделать идеально с первого раза: сейчас важнее увидеть одно понятное улучшение.",
  "Если результат отличается от примера — это нормально. Сверь один критерий, исправь и проверь снова.",
  "Ты тренируешь конкретный навык, а не весь монтаж сразу. Сделай один аккуратный шаг.",
  "Сохрани версию до изменений: сравнение «до / после» покажет прогресс лучше ощущения.",
];

export function lessonTeachingPlan(lesson:Lesson){
  const seed=Array.from(lesson.slug).reduce((sum,char)=>sum+char.charCodeAt(0),0);
  const action=actionFor(lesson);
  const result=lesson.checklist[0]||lesson.summary;
  const asset=lesson.theoryOnly
    ?"Заметки или текстовый документ для короткого ответа."
    :action==="audio"
      ?"Короткий клип с речью, разрешённый музыкальный трек и наушники."
      :action==="client"
        ?"Шаблон брифа, текст задания или один свой завершённый проект."
        :"3–5 коротких исходников, отдельная папка проекта и 1–2 ГБ свободного места.";
  return {
    action,
    purpose:lesson.summary,
    prerequisite:lesson.theoryOnly?"Специальные знания не нужны.":"Открыт проект, исходники скопированы в отдельную папку, предыдущий урок завершён.",
    result,
    assets:asset,
    guidedAction:lesson.steps.slice(0,Math.min(3,lesson.steps.length)),
    independentAction:lesson.assignment,
    technicalRequirements:lesson.theoryOnly
      ?["Ответ связан с темой урока","Есть собственный пример","Мини-тест: минимум 2 из 3"]
      :[...lesson.checklist.slice(0,3),"Мини-тест: минимум 2 из 3","Короткое описание выполненного действия"],
    failReasons:lesson.mistakes.slice(0,3),
    encouragement:encouragement[seed%encouragement.length],
    demoScript:[
      `0:00–0:05 — показать результат «до / после» и назвать цель: ${result}.`,
      `0:05–0:20 — показать нужную зону интерфейса и выполнить действие без ускорения.`,
      "0:20–0:35 — повторить действие крупнее, проговорить проверку и типичную ошибку.",
      "0:35–0:45 — показать готовый результат и дать самостоятельное задание.",
    ],
    before:lesson.mistakes[0]||"Результат не проверен",
    after:result,
  };
}
