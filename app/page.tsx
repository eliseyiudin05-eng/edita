import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/site-footer";
import {curriculumStats} from "@/lib/curriculum";
import {getSupabasePublicConfig} from "@/lib/public-config";
import {createClient} from "@supabase/supabase-js";

async function getTestimonials(){
  try{
    const {url,key}=getSupabasePublicConfig();
    const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data}=await supabase.from("testimonials")
      .select("display_name,role_label,text,rating")
      .eq("approved",true)
      .eq("permission_to_publish",true)
      .order("created_at",{ascending:false})
      .limit(6);
    return data||[];
  }catch{return []}
}

const features=[
  ["Академия",`${curriculumStats.lessons} уроков от установки CapCut до портфолио, клиентов и профессиональных программ.`],
  ["AI рядом","Задай простой вопрос в любом уроке. История разговора сохраняется в аккаунте."],
  ["Разбор своего Reel","Добавь видео, кадр, сценарий или субтитры и получи правки именно по своей работе."],
  ["Практика с клиентом","Тренируй цену, сроки, правки и сложные сообщения до реального заказа."],
  ["Друзья и школы","Аватары, рейтинг друзей, учебные группы и добровольный командный рейтинг учебных заведений."],
  ["Путь к работе","Портфолио, проверенные компании, задания и вакансии собраны в одном кабинете."]
];

const faq=[
  ["Я впервые открыл редактор. Я пойму?","Да. Первый маршрут начинается с установки, создания проекта, импорта файлов и таймлайна. Английские слова сразу объясняются по-русски."],
  ["Сейчас нужно платить?","Нет. Во время закрытой беты касса выключена. Участник с персональным кодом создаёт аккаунт без письма и без карты."],
  ["Почему следующий урок закрыт?","Каждый следующий урок открывается после практического задания предыдущего. Так эффекты и сложные приёмы не обгоняют основу."],
  ["Чем базовый AI отличается от PRO?","База даёт короткий словесный разбор до пяти действий. PRO смотрит больше кадров, расставляет приоритеты и даёт подробный план с доступными таймкодами."],
  ["AI выбирает победителя конкурса?","Нет. Система хранит подтверждённые просмотры, а команда вручную проверяет ссылки, накрутку и соблюдение правил."],
  ["Можно пользоваться в 14–17 лет?","Учиться можно. Денежные конкурсы и коммерческие функции требуют подтверждения законного представителя. Название школы по умолчанию скрыто."],
  ["Какие программы есть в маршруте?","CapCut, Premiere Pro, DaVinci Resolve и Final Cut. База монтажа одна, а пути к кнопкам адаптированы под программу."]
];

export default async function Home(){
  const testimonials=await getTestimonials();

  return <main className="landing">
    <nav className="topbar shell sticky-public-nav">
      <Link className="brand" href="/">EDITA<span>.</span></Link>
      <div className="nav-actions">
        <a href="#beta">Бета</a>
        <a href="#challenge">10 000 ₽</a>
        <a href="#inside">Что внутри</a>
        <Link href="/pricing">Тарифы</Link>
        <Link href="/login">Войти</Link>
        <Link className="btn btn-dark" href="/signup/editor">Занять место</Link>
      </div>
    </nav>

    <section className="hero shell hero-new">
      <div className="hero-grid">
        <div>
          <div className="eyebrow">МОНТАЖ С НУЛЯ · AI · ПРАКТИКА · РАБОТА</div>
          <h1 className="structured-title">Научись монтировать.<span>Сделай первый Reel.</span><span>Покажи, что умеешь.</span></h1>
          <p className="hero-copy">EDITA ведёт от первой кнопки в CapCut до сильного ролика, портфолио и понятного общения с клиентом. Уроки открываются постепенно, а AI отвечает прямо внутри обучения.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/signup/editor">Войти в бесплатную бету</Link>
            <Link className="btn btn-ghost" href="/review-access">Посмотреть готовый аккаунт</Link>
          </div>
          <div className="simple-proof">
            <span>{curriculumStats.lessons} уроков и {curriculumStats.assignments} заданий</span>
            <span>Подросткам 14+ и взрослым</span>
            <span>Прогресс и AI-чаты сохраняются</span>
          </div>
        </div>
        <figure className="hero-photo">
          <Image priority src="/images/edita-hero-community.webp" width={1586} height={992} sizes="(max-width: 900px) 100vw, 48vw" alt="Подростки старше 14 лет и взрослый автор вместе учатся видеомонтажу в современной студии"/>
          <figcaption>Для первого ролика в 14 лет, новой профессии во взрослом возрасте и команды, которой нужны авторы.</figcaption>
        </figure>
      </div>
    </section>

    <section className="founder-line">
      <div className="shell founder-line-inner"><div><span>С чего началась идея EDITA</span><strong>С денег, сэкономленных в школьном буфете, — к первому заработку на монтаже.</strong></div><p>Начать можно с малого: телефона, бесплатного редактора и одного понятного задания.</p></div>
    </section>

    <section id="beta" className="section shell beta-home-section">
      <div className="beta-home-head"><div><div className="section-kicker">ЗАКРЫТАЯ БЕТА ДО 12 НОЯБРЯ 2026</div><h2>Первые 50 человек тестируют EDITA бесплатно</h2><p>Без карты, кассы и автоматического продления. Персональный код создаёт подтверждённый аккаунт сразу — письмо Resend для тестировщика не требуется.</p></div><div className="zero-price"><small>СЕЙЧАС</small><strong>0 ₽</strong><span>50 мест</span></div></div>
      <div className="beta-plan-grid">
        <article><span>БАЗА</span><h3>Учёба и простой AI</h3><p>Весь маршрут, задания, сохранение прогресса, чат, друзья, рейтинги и короткий словесный разбор файла.</p><b>После беты: 1 490 ₽</b></article>
        <article className="pro"><span>AI PRO</span><h3>Максимальный разбор</h3><p>Больше кадров, доступные таймкоды, приоритет правок, hook, композиция, субтитры и финальный чек-лист.</p><b>После беты: 499 ₽ / 30 дней</b></article>
      </div>
      <div className="beta-home-actions"><Link className="btn btn-dark" href="/signup/editor">Использовать персональный код</Link><Link className="btn btn-ghost" href="/pricing">Сравнить базу и PRO</Link></div>
    </section>

    <section id="challenge" className="challenge-home-band">
      <div className="shell challenge-home-grid">
        <div><div className="section-kicker light">EDITA REELS · СЕЗОН 1</div><h2>Сними честный Reel про EDITA. Забери часть 10 000 ₽.</h2><p>Опубликуй ролик в открытой социальной сети, отметь EDITA и отправь ссылку до 12 ноября 2026 года. Три места определяются по подтверждённым просмотрам.</p><div className="challenge-home-actions"><Link className="btn btn-lime" href="/platform#community">Участвовать</Link><Link className="btn btn-light" href="/challenge-rules">Прочитать правила</Link></div></div>
        <div className="challenge-prize-card"><div><span>1 место</span><strong>5 000 ₽</strong></div><div><span>2 место</span><strong>3 000 ₽</strong></div><div><span>3 место</span><strong>2 000 ₽</strong></div><p>До 100 участников · новый сезон каждые 2 месяца · с 14 лет</p></div>
      </div>
    </section>

    <section className="section shell audience-section">
      <div className="section-kicker">ОДНА ПЛАТФОРМА · РАЗНЫЕ ЦЕЛИ</div>
      <h2>Не детский курс и не закрытый клуб профессионалов</h2>
      <div className="audience-grid">
        <article><span>14–17</span><h3>Первый сильный навык</h3><p>Безопасный маршрут, понятные подсказки, учебные группы и практика без давления «ты уже должен всё знать».</p></article>
        <article><span>18+</span><h3>Контент и профессия</h3><p>Reels, Shorts, YouTube, портфолио, переговоры и переход от CapCut к Premiere Pro или DaVinci Resolve.</p></article>
        <article><span>КОМПАНИИ</span><h3>Авторы по реальным работам</h3><p>Проверенные задания, портфолио, сравнение навыков и поиск людей не только по красивому резюме.</p></article>
      </div>
    </section>

    <section id="inside" className="section shell">
      <div className="section-kicker">ВСЁ В ОДНОМ КАБИНЕТЕ</div>
      <h2>Не десять вкладок и случайные видео, а один связанный маршрут</h2>
      <div className="feature-grid">{features.map(([title,text])=><article className="feature-card" key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="visual-band">
      <div className="shell visual-grid">
        <figure><Image src="/images/edita-company-collaboration.webp" width={1448} height={1086} sizes="(max-width: 900px) 100vw, 50vw" alt="Молодой монтажёр показывает ролик взрослой команде компании"/></figure>
        <div><div className="section-kicker light">ОТ ПЕРВОЙ КНОПКИ ДО РЕАЛЬНОГО ТЗ</div><h2>Не понял слово? Значит, объяснение нужно сделать проще.</h2><p>Каждый урок показывает, зачем нужен приём, куда нажать, что должно появиться на экране и как самому проверить результат. Если интерфейс изменился, AI уточнит устройство и версию программы.</p><Link className="btn btn-light" href="/signup/editor">Получить свой маршрут</Link></div>
      </div>
    </section>

    <section className="section shell path-section">
      <div className="section-kicker">КАК РАСТЁТ СЛОЖНОСТЬ</div>
      <h2>Сначала первый уверенный ролик. Потом скорость, стиль и клиенты.</h2>
      <div className="steps-road">
        <article><b>1</b><div><h3>Открой и не потеряйся</h3><p>Установка, новый проект, файлы, экран редактора, таймлайн и экспорт.</p></div></article>
        <article><b>2</b><div><h3>Собери основу</h3><p>Чистые склейки, hook, ритм, звук, субтитры и B-roll без лишних эффектов.</p></div></article>
        <article><b>3</b><div><h3>Сделай свой Reel</h3><p>Сценарий, съёмка, монтаж, проверка файла и разбор понятным языком.</p></div></article>
        <article><b>4</b><div><h3>Работай увереннее</h3><p>ТЗ, цена, правки, портфолио, Premiere Pro, DaVinci Resolve и Final Cut.</p></div></article>
      </div>
    </section>

    <section className="section shell difference-section">
      <div className="section-kicker">ЧЕМ EDITA ОТЛИЧАЕТСЯ</div>
      <h2>Сильнее обычного курса там, где всё связано между собой</h2>
      <div className="difference-grid">
        <article><span>Обычные видеоуроки</span><p>Посмотрел и сам решаешь, понял ли материал.</p><b>В EDITA</b><p>Задание, чек-лист и следующий урок только после практики.</p></article>
        <article><span>Редактор с шаблонами</span><p>Помогает быстро собрать ролик, но не строит профессию.</p><b>В EDITA</b><p>Навык переносится между CapCut, Premiere, DaVinci и Final Cut.</p></article>
        <article><span>Обычный AI-чат</span><p>Не знает твой маршрут, прогресс и прошлый вопрос.</p><b>В EDITA</b><p>Помнит диалог, видит контекст урока и разбирает твой файл по уровню тарифа.</p></article>
        <article><span>Доска вакансий</span><p>Показывает объявления, но не готовит к работе.</p><b>В EDITA</b><p>Сначала навык и практика, затем портфолио, проверенная компания и ТЗ.</p></article>
      </div>
      <p className="honest-claim">Мы не называем EDITA «лучшей в мире» без данных. Наша проверяемая ставка — самый понятный связанный путь от первой кнопки до первой сильной работы.</p>
    </section>

    <section className="community-vision-band">
      <div className="shell community-vision-grid"><div><div className="section-kicker">БОЛЬШЕ, ЧЕМ ПЛАТФОРМА</div><h2>Строим маркетинговую семью для миллиона авторов и компаний</h2><p>Это цель, а не выдуманная цифра аудитории. Внутри уже заложены профили с аватарами, друзья, группы, общий рейтинг, команды школ, соревнования и безопасный чат с AI-модерацией.</p></div><div className="community-metrics"><div><strong>1</strong><span>единый профиль</span></div><div><strong>3</strong><span>рейтинга: общий, друзья, школы</span></div><div><strong>24/7</strong><span>AI рядом в обучении</span></div></div></div>
    </section>

    <section className="section shell safety-home">
      <div className="section-kicker">БЕЗОПАСНОСТЬ И ЧЕСТНОСТЬ</div>
      <h2>То, что особенно важно перед первым публичным днём</h2>
      <div className="safety-grid">
        <article><h3>Подростки</h3><p>Школа скрыта по умолчанию. Коммерция и денежный конкурс до 18 лет требуют подтверждения взрослого.</p></article>
        <article><h3>Компании</h3><p>Реальные вакансии и задания публикуются после проверки бизнеса. AI не назначает победителей.</p></article>
        <article><h3>Бета</h3><p>Касса выключена. Мы сначала собираем ошибки у 50 тестировщиков и только потом включаем оплату.</p></article>
      </div>
    </section>

    <section className="section shell">
      <div className="section-kicker">ОТЗЫВЫ</div>
      <h2>Только настоящие</h2>
      {testimonials.length?<div className="testimonial-grid">{testimonials.map((t:any,i:number)=><article className="testimonial-card" key={i}><div className="stars">{"★".repeat(Math.max(1,Math.min(5,Number(t.rating||5))))}</div><p>«{t.text}»</p><b>{t.display_name}</b><span>{t.role_label}</span></article>)}</div>:<div className="honest-empty"><b>Пока здесь пусто — и это нормально.</b><p>Мы не публикуем выдуманные отзывы. После беты здесь появятся только тексты реальных тестировщиков, которые разрешили публикацию.</p></div>}
    </section>

    <section className="section shell faq-section">
      <div className="section-kicker">ВОПРОСЫ ПЕРЕД СТАРТОМ</div>
      <h2>Коротко и без мелкого шрифта</h2>
      <div className="faq-grid">{faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>

    <section className="final-cta"><div className="shell"><div className="eyebrow">EDITA · ЗАКРЫТАЯ БЕТА</div><h2>Открой первый урок. Сделай первый Reel. Помоги нам найти ошибки до запуска.</h2><p>Персональный код — один новый аккаунт. Карта не нужна.</p><div className="hero-actions"><Link className="btn btn-lime" href="/signup/editor">Создать аккаунт</Link><Link className="btn btn-light" href="/review-access">Войти в демо</Link></div></div></section>

    <SiteFooter/>
  </main>;
}
