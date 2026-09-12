import Image from "next/image";
import type {Lesson} from "@/lib/curriculum";

type VisualKind="theory"|"mobile"|"desktop"|"social"|"audio"|"career";
type Focus="home"|"media"|"preview"|"timeline"|"tools"|"text"|"audio"|"export";
type InterfaceShot={
  src:string;
  width:number;
  height:number;
  alt:string;
  sourceLabel:string;
  sourceUrl:string;
  mobile?:boolean;
};

const interfaceShots={
  capcutHome:{src:"/images/academy/capcut-mobile-home.webp",width:333,height:592,alt:"Экран мобильного приложения CapCut с панелью инструментов и лентой монтажа",sourceLabel:"официальная карточка CapCut в Google Play",sourceUrl:"https://play.google.com/store/apps/details?id=com.lemon.lvoverseas",mobile:true},
  capcutCaptions:{src:"/images/academy/capcut-mobile-captions.webp",width:333,height:592,alt:"Экран CapCut с инструментами автоматических субтитров",sourceLabel:"официальная карточка CapCut в Google Play",sourceUrl:"https://play.google.com/store/apps/details?id=com.lemon.lvoverseas",mobile:true},
  capcutText:{src:"/images/academy/capcut-mobile-text.webp",width:333,height:592,alt:"Экран CapCut с шаблонами текста",sourceLabel:"официальная карточка CapCut в Google Play",sourceUrl:"https://play.google.com/store/apps/details?id=com.lemon.lvoverseas",mobile:true},
  capcutEffects:{src:"/images/academy/capcut-mobile-effects.webp",width:333,height:592,alt:"Экран CapCut с панелью видеоэффектов",sourceLabel:"официальная карточка CapCut в Google Play",sourceUrl:"https://play.google.com/store/apps/details?id=com.lemon.lvoverseas",mobile:true},
  capcutDesktop:{src:"/images/academy/capcut-desktop.webp",width:1052,height:592,alt:"Экран CapCut на компьютере со списком файлов, просмотром и лентой монтажа",sourceLabel:"официальная карточка CapCut",sourceUrl:"https://play.google.com/store/apps/details?id=com.lemon.lvoverseas"},
  vn:{src:"/images/academy/vn-mobile.webp",width:333,height:592,alt:"Экран мобильного редактора VN с клипами на ленте монтажа",sourceLabel:"официальная карточка VN в Google Play",sourceUrl:"https://play.google.com/store/apps/details?id=com.frontrow.vlog",mobile:true},
  inshot:{src:"/images/academy/inshot-mobile.webp",width:272,height:592,alt:"Экран мобильного редактора InShot с просмотром и нижней лентой монтажа",sourceLabel:"официальная карточка InShot в Google Play",sourceUrl:"https://play.google.com/store/apps/details?id=com.camerasideas.instashot",mobile:true},
  premiere:{src:"/images/academy/premiere-pro.webp",width:1000,height:563,alt:"Рабочий экран Adobe Premiere Pro с файлами, просмотром и несколькими дорожками монтажа",sourceLabel:"снимок экрана Premiere Pro",sourceUrl:"https://www.capcut.com/pt-br/resource/adobe-premiere-pro-tutorial"},
  davinci:{src:"/images/academy/davinci-resolve.webp",width:1600,height:886,alt:"Экран монтажа DaVinci Resolve со списком файлов, просмотром, настройками и лентой монтажа",sourceLabel:"пресс-материалы Blackmagic Design",sourceUrl:"https://www.businesswire.com/news/home/20210819005831/en/Blackmagic-Design-Announces-DaVinci-Resolve-17.3"},
  finalCut:{src:"/images/academy/final-cut-pro.webp",width:1304,height:1022,alt:"Экран Final Cut Pro со списком файлов, просмотром и лентой монтажа",sourceLabel:"руководство Apple Support",sourceUrl:"https://support.apple.com/guide/final-cut-pro/final-cut-pro-interface-ver92bd100a/mac"},
  canva:{src:"/images/academy/canva-video.webp",width:1492,height:986,alt:"Видеоредактор Canva с библиотекой материалов, окном просмотра и сценами",sourceLabel:"официальная страница Canva Video",sourceUrl:"https://www.canva.com/video-editor/"},
  afterEffects:{src:"/images/academy/after-effects.webp",width:1600,height:947,alt:"Окно Adobe After Effects с файлами, сценой, слоями и лентой времени",sourceLabel:"снимок экрана After Effects",sourceUrl:"https://dev.to/kocreative/after-effects-the-basics-915"}
} satisfies Record<string,InterfaceShot>;

const theoryStages:Record<string,string[]>={
  "start-without-fear":["Понять основу","Собрать 3 работы","Найти первый заказ","Цель: 10 000 ₽"],
  "what-is-editing":["Сырые кусочки","Убираем лишнее","Ставим по порядку","Получаем историю"],
  "first-10k-path":["Основа","3 учебные работы","Первый заказ","Цель: 10 000 ₽"],
  "editor-words":["Файлы","Окно просмотра","Лента монтажа","Инструменты","Сохранение"],
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
  return {media:"Новый проект",preview:"Окно просмотра",tools:"Изменить · Текст",timeline:"Лента монтажа",export:"Сохранить видео"};
}

function focusLabel(focus:Focus,ui:ReturnType<typeof labels>){
  if(focus==="home")return "Стартовый экран и безопасная установка";
  if(focus==="text")return "Текст и подписи в панели инструментов";
  if(focus==="audio")return "Звуковая дорожка под видео на ленте монтажа";
  return ui[focus as keyof typeof ui]||"Главный инструмент урока";
}

function interfaceShot(lesson:Lesson,focus:Focus):InterfaceShot|null{
  const software=lesson.software.toLocaleLowerCase("ru-RU");
  if(software.includes("capcut на телефоне")){
    if(lesson.slug==="capcut-auto-captions")return interfaceShots.capcutCaptions;
    if(focus==="text")return interfaceShots.capcutText;
    if(focus==="tools")return interfaceShots.capcutEffects;
    return interfaceShots.capcutHome;
  }
  if(software.includes("capcut desktop"))return interfaceShots.capcutDesktop;
  if(software==="capcut"||software.includes("capcut /"))return interfaceShots.capcutDesktop;
  if(software==="vn")return interfaceShots.vn;
  if(software==="inshot")return interfaceShots.inshot;
  if(software.includes("after effects"))return interfaceShots.afterEffects;
  if(software.includes("final cut"))return interfaceShots.finalCut;
  if(software.includes("canva"))return interfaceShots.canva;
  if(software.includes("davinci"))return interfaceShots.davinci;
  if(software.includes("premiere"))return interfaceShots.premiere;
  return null;
}

export default function LessonVisual({lesson}:{lesson:Lesson}){
  const kind=visualKind(lesson);
  const focus=focusBySlug[lesson.slug]||"preview";
  const ui=labels(lesson.software);
  const shot=interfaceShot(lesson,focus);

  if(kind==="theory"){
    const stages=theoryStages[lesson.slug]||["Понять","Увидеть пример","Запомнить основу","Идти дальше"];
    return <figure className="lesson-visual lesson-theory-visual" role="img" aria-label={"Схема к уроку: "+lesson.title}>
      <div className="lesson-visual-head"><span>КАРТИНКА УРОКА</span><b>{lesson.title}</b></div>
      <div className="theory-road">{stages.map((stage,index)=><div className="theory-road-step" key={stage}><i>{index+1}</i><strong>{stage}</strong>{index<stages.length-1?<span>→</span>:null}</div>)}</div>
      <figcaption>Главная мысль: {lesson.summary}</figcaption>
    </figure>;
  }

  if(shot)return <figure className={"lesson-visual lesson-real-interface "+(shot.mobile?"real-mobile-interface":"real-desktop-interface")}>
    <div className="lesson-visual-head"><span>РЕАЛЬНЫЙ ИНТЕРФЕЙС · {lesson.software}</span><b>{lesson.title}</b></div>
    <div className="lesson-real-interface-frame">
      <Image src={shot.src} width={shot.width} height={shot.height} sizes={shot.mobile?"(max-width: 720px) 78vw, 330px":"(max-width: 900px) 92vw, 760px"} alt={shot.alt}/>
      <span className="lesson-interface-focus"><small>СЕЙЧАС ИЩЕМ</small><b>{focusLabel(focus,ui)}</b></span>
    </div>
    <figcaption><b>Смотри на отмеченную зону:</b> весь остальной экран можно изучить позже. В новой версии кнопка может немного сдвинуться. <a href={shot.sourceUrl} target="_blank" rel="noreferrer">Источник: {shot.sourceLabel} ↗</a></figcaption>
  </figure>;

  if(kind==="audio")return <figure className="lesson-visual lesson-audio-visual" role="img" aria-label={"Схема звука: "+lesson.title}>
    <div className="lesson-visual-head"><span>{lesson.software}</span><b>{lesson.title}</b></div>
    <div className="audio-mixer-picture"><div className="audio-track voice"><b>Голос</b><span/><span/><span/><span/><span/></div><div className="audio-track music"><b>Музыка</b><span/><span/><span/><span/><span/></div><div className="audio-track sfx"><b>Эффекты</b><span/><span/><span/></div><i className="audio-safe-line"/></div>
    <figcaption><b>Смотри сюда:</b> {focusLabel(focus,ui)}. Голос должен оставаться понятнее музыки.</figcaption>
  </figure>;

  if(kind==="career")return <figure className="lesson-visual lesson-career-visual" role="img" aria-label={"Схема работы: "+lesson.title}>
    <div className="lesson-visual-head"><span>РАБОТА С КЛИЕНТОМ</span><b>{lesson.title}</b></div>
    <div className="career-board-picture"><div><i>1</i><b>Понять задачу</b><small>Что нужно получить</small></div><div><i>2</i><b>Согласовать</b><small>Срок, цена, правки</small></div><div><i>3</i><b>Сделать</b><small>Черновик и проверка</small></div><div><i>4</i><b>Показать результат</b><small>Файл и кейс</small></div></div>
    <figcaption>В этом уроке фокус: {lesson.summary}</figcaption>
  </figure>;

  if(kind==="social")return <figure className="lesson-visual lesson-social-visual" role="img" aria-label={"Схема вертикального ролика: "+lesson.title}>
    <div className="lesson-visual-head"><span>КОРОТКОЕ ВЕРТИКАЛЬНОЕ ВИДЕО</span><b>{lesson.title}</b></div>
    <div className="social-phone-picture"><div className="social-safe-zone"><span>безопасная зона</span><strong>ПОНЯТНЫЙ<br/>ТЕКСТ</strong><small>лицо или главный объект</small></div><div className="social-controls">♡<br/>◯<br/>↗</div><div className="social-timeline"><i/><b>0:00</b><b>0:03</b><b>0:10</b></div></div>
    <figcaption><b>Что замечаем:</b> {lesson.summary}</figcaption>
  </figure>;

  const isMobile=kind==="mobile";
  return <figure className={"lesson-visual lesson-ui-visual "+(isMobile?"mobile-ui":"desktop-ui")+" focus-"+focus} role="img" aria-label={"Простая карта экрана "+lesson.software}>
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
    <figcaption><b>Сейчас ищем:</b> {focusLabel(focus,ui)}. Цифры показывают четыре главные зоны; остальные кнопки можно изучить позже.</figcaption>
  </figure>;
}
