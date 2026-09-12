import type {Lesson} from "@/lib/curriculum";

type VisualKind="theory"|"mobile"|"desktop"|"social"|"audio"|"career";
type Focus="home"|"media"|"preview"|"timeline"|"tools"|"text"|"audio"|"export";

const theoryStages:Record<string,string[]>={
  "start-without-fear":["Понять основу","Собрать 3 работы","Найти первый заказ","Цель: 10 000 ₽"],
  "what-is-editing":["Сырые кусочки","Убираем лишнее","Ставим по порядку","Получаем историю"],
  "first-10k-path":["Основа","3 учебные работы","Первый заказ","Цель: 10 000 ₽"],
  "editor-words":["Медиа","Окно просмотра","Таймлайн","Инструменты","Экспорт"],
  "first-reel-plan":["Выбрать устройство","Выбрать редактор","Открыть официальный сайт","Установить безопасно"]
};

const focusBySlug:Record<string,Focus>={
  "capcut-install":"home","capcut-new-project":"media","capcut-timeline":"timeline","capcut-first-split":"tools","capcut-reorder":"timeline",
  "capcut-format-vertical":"preview","video-settings-basics":"export","capcut-clean-cut":"timeline","capcut-auto-captions":"text","capcut-music":"audio","capcut-first-export":"export",
  "hook-basics":"preview","story-basics":"timeline","shoot-for-edit":"preview","b-roll":"media","retention-basics":"timeline","subtitle-design":"text","transitions":"tools","loop-ending":"timeline","cover-and-title":"text",
  "voice-music-sfx":"audio","color-basics":"tools","keyframes":"tools","overlays":"timeline","speed-control":"tools","accessible-video":"preview","copyright-basics":"audio",
  "capcut-desktop-install":"home","capcut-desktop":"timeline","vn-install":"home","vn-first-project":"timeline","inshot-install":"home","inshot-first-project":"tools",
  "premiere-install":"home","premiere-first-project":"media","davinci-install":"home","davinci-first-project":"export","final-cut-install":"home","final-cut-first-project":"timeline",
  "canva-install":"home","canva-video":"text","after-effects-install":"home","after-effects-first-project":"timeline",
  "masking":"tools","chroma-key":"tools","advanced-color":"tools","sound-design":"audio","multicam":"timeline",
  "client-brief":"media","pricing":"export","revision-system":"timeline","portfolio":"preview","analytics":"export","final-project":"timeline"
};

function visualKind(lesson:Lesson):VisualKind{
  if(lesson.theoryOnly)return "theory";
  const value=(lesson.software+" "+lesson.track).toLocaleLowerCase("ru-RU");
  if(value.includes("звук"))return "audio";
  if(value.includes("работа")||value.includes("карьер")||value.includes("рост"))return "career";
  if(value.includes("reels")||value.includes("shorts")||value.includes("публикац")||value.includes("съёмка"))return "social";
  if(value.includes("телефон")||value.includes("mobile")||value.includes("vn")||value.includes("inshot"))return "mobile";
  if(value.includes("desktop")||value.includes("premiere")||value.includes("davinci")||value.includes("final cut")||value.includes("after effects")||value.includes("canva"))return "desktop";
  return "desktop";
}

function labels(software:string){
  const value=software.toLocaleLowerCase("ru-RU");
  if(value.includes("premiere"))return {media:"Project",preview:"Program",tools:"Properties",timeline:"Timeline",export:"Export"};
  if(value.includes("davinci"))return {media:"Media Pool",preview:"Viewer",tools:"Inspector",timeline:"Edit Timeline",export:"Deliver"};
  if(value.includes("final cut"))return {media:"Browser",preview:"Viewer",tools:"Inspector",timeline:"Magnetic Timeline",export:"Share"};
  if(value.includes("after effects"))return {media:"Project",preview:"Composition",tools:"Properties",timeline:"Layers + Timeline",export:"Render Queue"};
  if(value.includes("canva"))return {media:"Загрузки",preview:"Страница 9:16",tools:"Дизайн и текст",timeline:"Сцены",export:"Поделиться"};
  if(value.includes("capcut desktop"))return {media:"Media",preview:"Player",tools:"Details",timeline:"Timeline",export:"Export"};
  if(value.includes("vn"))return {media:"New Project",preview:"Просмотр",tools:"Split · Text · FX",timeline:"Лента клипов",export:"Export"};
  if(value.includes("inshot"))return {media:"Видео → Новый",preview:"Холст 9:16",tools:"Обрезка · Текст",timeline:"Лента клипов",export:"Сохранить"};
  return {media:"Новый проект",preview:"Окно просмотра",tools:"Изменить · Текст",timeline:"Таймлайн",export:"Экспорт"};
}

function focusLabel(focus:Focus,ui:ReturnType<typeof labels>){
  if(focus==="home")return "Стартовый экран и безопасная установка";
  if(focus==="text")return "Текст и подписи в панели инструментов";
  if(focus==="audio")return "Аудиодорожка под видео на таймлайне";
  return ui[focus as keyof typeof ui]||"Главный инструмент урока";
}

export default function LessonVisual({lesson}:{lesson:Lesson}){
  const kind=visualKind(lesson);
  const focus=focusBySlug[lesson.slug]||"preview";
  const ui=labels(lesson.software);

  if(kind==="theory"){
    const stages=theoryStages[lesson.slug]||["Понять","Увидеть пример","Запомнить основу","Идти дальше"];
    return <figure className="lesson-visual lesson-theory-visual" role="img" aria-label={"Схема к уроку: "+lesson.title}>
      <div className="lesson-visual-head"><span>КАРТИНКА УРОКА</span><b>{lesson.title}</b></div>
      <div className="theory-road">{stages.map((stage,index)=><div className="theory-road-step" key={stage}><i>{index+1}</i><strong>{stage}</strong>{index<stages.length-1?<span>→</span>:null}</div>)}</div>
      <figcaption>Главная мысль: {lesson.summary}</figcaption>
    </figure>;
  }

  if(kind==="audio")return <figure className="lesson-visual lesson-audio-visual" role="img" aria-label={"Схема звука: "+lesson.title}>
    <div className="lesson-visual-head"><span>{lesson.software}</span><b>{lesson.title}</b></div>
    <div className="audio-mixer-picture"><div className="audio-track voice"><b>Голос</b><span/><span/><span/><span/><span/></div><div className="audio-track music"><b>Музыка</b><span/><span/><span/><span/><span/></div><div className="audio-track sfx"><b>SFX</b><span/><span/><span/></div><i className="audio-safe-line"/></div>
    <figcaption><b>Смотри сюда:</b> {focusLabel(focus,ui)}. Голос должен оставаться понятнее музыки.</figcaption>
  </figure>;

  if(kind==="career")return <figure className="lesson-visual lesson-career-visual" role="img" aria-label={"Схема работы: "+lesson.title}>
    <div className="lesson-visual-head"><span>РАБОТА С КЛИЕНТОМ</span><b>{lesson.title}</b></div>
    <div className="career-board-picture"><div><i>1</i><b>Понять задачу</b><small>Что нужно получить</small></div><div><i>2</i><b>Согласовать</b><small>Срок, цена, правки</small></div><div><i>3</i><b>Сделать</b><small>Черновик и проверка</small></div><div><i>4</i><b>Показать результат</b><small>Файл и кейс</small></div></div>
    <figcaption>В этом уроке фокус: {lesson.summary}</figcaption>
  </figure>;

  if(kind==="social")return <figure className="lesson-visual lesson-social-visual" role="img" aria-label={"Схема вертикального ролика: "+lesson.title}>
    <div className="lesson-visual-head"><span>REELS · SHORTS · ВЕРТИКАЛЬНОЕ ВИДЕО</span><b>{lesson.title}</b></div>
    <div className="social-phone-picture"><div className="social-safe-zone"><span>безопасная зона</span><strong>ПОНЯТНЫЙ<br/>ТЕКСТ</strong><small>лицо или главный объект</small></div><div className="social-controls">♡<br/>◯<br/>↗</div><div className="social-timeline"><i/><b>0:00</b><b>0:03</b><b>0:10</b></div></div>
    <figcaption><b>Что замечаем:</b> {lesson.summary}</figcaption>
  </figure>;

  const isMobile=kind==="mobile";
  return <figure className={"lesson-visual lesson-ui-visual "+(isMobile?"mobile-ui":"desktop-ui")+" focus-"+focus} role="img" aria-label={"Упрощённая карта интерфейса "+lesson.software}>
    <div className="lesson-visual-head"><span>{lesson.software}</span><b>{lesson.title}</b></div>
    <div className="lesson-ui-window">
      <div className="lesson-ui-top"><i/><i/><i/><span>{focus==="home"?"Официальная установка":"Проект EDITA"}</span><b className="ui-export">{ui.export}</b></div>
      <div className="lesson-ui-main">
        <div className="ui-media"><em>1</em><b>{ui.media}</b><span/><span/><span/></div>
        <div className="ui-preview"><em>2</em><div><span>9:16</span><b>ТВОЙ<br/>РОЛИК</b></div><small>{ui.preview}</small></div>
        <div className="ui-tools"><em>3</em><b>{ui.tools}</b><span/><span/><span/><span/></div>
      </div>
      <div className="ui-timeline"><em>4</em><b>{ui.timeline}</b><div/><div/><i/></div>
    </div>
    <figcaption><b>Сейчас ищем:</b> {focusLabel(focus,ui)}. Цифры показывают четыре главные зоны; остальные кнопки пока можно не трогать.</figcaption>
  </figure>;
}
