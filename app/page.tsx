import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/site-footer";
import {curriculumStats} from "@/lib/curriculum";
import {getSupabasePublicConfig} from "@/lib/public-config";
import {createClient} from "@supabase/supabase-js";

export const metadata:Metadata={
  alternates:{canonical:"/"},
};

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
  ["Уроки по шагам",`${curriculumStats.lessons} коротких уроков: от установки программы до своих работ и общения с заказчиком.`],
  ["Помощник KIVRONIX","Задай вопрос обычными словами. Помощник объяснит, куда нажать и как проверить результат."],
  ["Разбор твоего ролика","Загрузи видео и получи оценку кадров, понятный список правок и следующий шаг."],
  ["Практика с заказчиком","Потренируй цену, сроки, правки и ответы на сложные сообщения до первого заказа."],
  ["Закрытые чаты","После выбора монтажёра компания получает общий чат. Контакты, ссылки и мессенджеры остаются за его пределами."],
  ["Путь к работе","Новички растут от урока к первым заказам, а опытные монтажёры показывают портфолио и находят новые проекты."]
];

const faq=[
  ["Я впервые открыл программу. Я пойму?","Да. Сначала ты узнаешь самые простые вещи, затем установишь программу и соберёшь первый ролик. Каждое новое слово сразу получает понятное объяснение."],
  ["Сколько стоит KIVRONIX?","Сейчас основные функции открыты бесплатно. Банковская карта для регистрации не нужна."],
  ["Как идут уроки?","Уроки открываются по очереди. Сначала основа, затем маленькое задание и только потом следующий шаг. Такой порядок помогает спокойно закрепить навык."],
  ["Что доступно бесплатно?","Учебный путь, разбор роликов, помощник, сохранение прогресса, свои работы, конкурсы, вакансии, сообщество и закрытые рабочие чаты."],
  ["Как выбирают победителя конкурса?","Для конкурса KIVRONIX команда проверяет работы и настоящие просмотры. В конкурсе компании победителя выбирает сама компания по заранее опубликованным правилам."],
  ["Можно пользоваться в 14–17 лет?","Учиться можно сразу. Для денежного конкурса и коммерческой работы понадобится подтверждение взрослого. Название школы скрыто по умолчанию."],
  ["Как защищён рабочий чат?","Сообщения видят только выбранный монтажёр и компания. Телефон, электронная почта, ссылки, адреса страниц и мессенджеры остаются за пределами чата, поэтому разговор идёт внутри KIVRONIX."]
];

export default async function Home(){
  const testimonials=await getTestimonials();

  return <main className="landing">
    <header className="public-header sticky-public-nav"><nav className="topbar shell">
        <Link className="brand brand-home" href="/" title="Вернуться на главную" aria-label="KIVRONIX — перейти на главную">
          <Image className="brand-logo-mark" src="/images/kivronix-frog-mark.png" width={48} height={48} alt="" aria-hidden="true"/>
          <span className="brand-name">KIVRONIX<b>.</b></span>
          <small>монтаж · обучение · работа</small>
        </Link>
        <div className="nav-actions">
          <a href="#free">Бесплатно</a>
          <Link href="/pricing">Возможности</Link>
          <a href="#challenge">10 000 Points</a>
          <a href="#inside">Что внутри</a>
          <a href="#safety">Защита</a>
          <Link href="/login">Войти</Link>
          <Link className="btn btn-dark" href="/signup">Начать</Link>
        </div>
    </nav></header>

    <section className="hero shell hero-new">
      <div className="hero-grid">
        <div>
          <div className="eyebrow">ВСЁ О ВИДЕОМОНТАЖЕ В ОДНОМ МЕСТЕ</div>
          <h1 className="structured-title">Научись монтировать<span>Или найди профессионала</span></h1>
          <p className="hero-copy"><strong>KIVRONIX объединяет обучение видеомонтажу и профессиональный рынок исполнителей.</strong> Новички осваивают профессию с нуля и собирают первые работы, а опытные монтажёры приходят за новыми проектами. Компания может сравнить навыки, портфолио и результаты реальных заданий, чтобы выбрать специалиста нужного уровня.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/signup/editor">Хочу научиться монтажу</Link>
            <Link className="btn btn-ghost" href="/signup/business">Найти монтажёра</Link>
          </div>
          <div className="simple-proof">
            <span>{curriculumStats.lessons} уроков и {curriculumStats.assignments} заданий</span>
            <span>Новички и профессионалы</span>
            <span>Основные функции бесплатно</span>
          </div>
        </div>
        <figure className="hero-photo">
          <Image priority src="/images/kivronix-hero-community.webp" width={1586} height={992} sizes="(max-width: 900px) 100vw, 48vw" alt="Подростки и взрослый автор вместе учатся видеомонтажу в современной студии"/>
          <figcaption>Учись на простых заданиях, показывай работы и находи реальные проекты.</figcaption>
        </figure>
      </div>
    </section>

    <section className="founder-line">
      <div className="shell founder-line-inner"><div><span>Что можно сделать в KIVRONIX</span><strong>Освоить монтаж с нуля или использовать готовый опыт для поиска новых заказчиков.</strong></div><p>Компания видит не только начинающих участников, но и профессионалов с портфолио и подтверждёнными навыками.</p></div>
    </section>

    <section id="free" className="section shell beta-home-section">
      <div className="beta-home-head"><div><div className="section-kicker">ДОСТУПНО ДЛЯ КАЖДОГО</div><h2>KIVRONIX открыта бесплатно</h2><p>Создай обычный аккаунт и пользуйся основными функциями. Банковская карта не требуется.</p></div><div className="zero-price"><small>ДОСТУП</small><strong>0 ₽</strong><span>без карты</span></div></div>
      <div className="beta-plan-grid">
        <article><span>МОНТАЖЁРУ</span><h3>Учёба и полный разбор</h3><p>Все уроки, задания, помощник, разбор видео, прогресс, свои работы, конкурсы, друзья и вакансии.</p><b>Открыто сразу после входа</b></article>
        <article className="pro"><span>КОМПАНИИ</span><h3>Поиск монтажёров любого уровня</h3><p>Выбирайте перспективных новичков или опытных профессионалов по портфолио, навыкам и результатам заданий.</p><b>Открыто бесплатно</b></article>
      </div>
      <div className="beta-home-actions"><Link className="btn btn-dark" href="/signup/editor">Я монтажёр</Link><Link className="btn btn-ghost" href="/signup/business">Я представляю компанию</Link><Link className="btn btn-ghost" href="/pricing">Посмотреть будущие планы</Link></div>
    </section>

    <section id="challenge" className="challenge-home-band">
      <div className="shell challenge-home-grid">
        <div><div className="section-kicker light">КОНКУРС KIVRONIX · СЕЗОН 1</div><h2>Сделай ролик и выиграй часть из 10 000 бонусных KIVRONIX Points</h2><p><strong>Сезон официально стартует после регистрации 50 участников.</strong> Оставь заявку и ролик заранее: срок конкурсного этапа начнёт отсчитываться только после достижения порога.</p><ol className="prize-flow"><li><b>Набираем 50 участников</b><span>До старта заявки собираются без сокращения конкурсного срока.</span></li><li><b>Начинается сезон</b><span>Все участники получают одинаковый срок и понятные правила.</span></li><li><b>Подводим итоги</b><span>После проверки публикаций три победителя получают 10 000 KP.</span></li></ol><p className="prize-note">KIVRONIX Points — бонусные поинты платформы. Их нельзя купить, перевести или вывести в деньги.</p><div className="challenge-home-actions"><Link className="btn btn-lime" href="/platform#kivronix-challenges">Зарегистрироваться</Link><Link className="btn btn-light" href="/challenge-rules">Прочитать правила</Link></div></div>
        <div className="challenge-prize-card"><div><span>1 место</span><strong>5 000 KP</strong></div><div><span>2 место</span><strong>3 000 KP</strong></div><div><span>3 место</span><strong>2 000 KP</strong></div><p>Бонусные поинты · до 100 участников · с 14 лет</p></div>
      </div>
    </section>

    <section className="section shell audience-section">
      <div className="section-kicker">ОДНА ПЛАТФОРМА · РАЗНЫЕ ЦЕЛИ</div>
      <h2>Новички, профессионалы, блогеры и компании — в одной системе</h2>
      <div className="audience-grid">
        <article><span>НАЧИНАЮЩИМ</span><h3>Понятный старт с нуля</h3><p>Пошаговые уроки, безопасная практика и первые работы для портфолио без лишней сложности.</p></article>
        <article><span>ПРОФЕССИОНАЛАМ</span><h3>Новые проекты и заказчики</h3><p>Показывайте сильные работы, участвуйте в конкурсах и находите компании, которым нужен ваш уровень монтажа.</p></article>
        <article><span>КОМПАНИЯМ</span><h3>Выбор по опыту и работам</h3><p>Сравнивайте начинающих и профессиональных монтажёров, их портфолио и результаты реальных заданий.</p></article>
        <article><span>БЛОГЕРАМ</span><h3>Команда для регулярного контента</h3><p>Находите монтажёров своего уровня, ставьте задачи, обсуждайте правки и храните рабочую историю в одном кабинете.</p></article>
      </div>
    </section>

    <section id="inside" className="section shell">
      <div className="section-kicker">ВСЁ В ОДНОМ КАБИНЕТЕ</div>
      <h2>Один понятный путь от урока до работы</h2>
      <div className="feature-grid">{features.map(([title,text])=><article className="feature-card" key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="visual-band">
      <div className="shell visual-grid">
        <figure><Image src="/images/kivronix-company-collaboration.webp" width={1448} height={1086} sizes="(max-width: 900px) 100vw, 50vw" alt="Молодой монтажёр показывает ролик команде компании"/></figure>
        <div><div className="section-kicker light">ОТ ПЕРВОЙ КНОПКИ ДО НАСТОЯЩЕГО ЗАДАНИЯ</div><h2>Каждое сложное слово получает простое объяснение</h2><p>Урок показывает смысл приёма, нужную кнопку, ожидаемый результат на экране и способ самостоятельной проверки. Помощник уточняет устройство и версию программы, когда кнопки меняют место.</p><Link className="btn btn-light" href="/signup/editor">Получить свой путь</Link></div>
      </div>
    </section>

    <section className="section shell path-section">
      <div className="section-kicker">КАК РАСТЁТ СЛОЖНОСТЬ</div>
      <h2>От первого монтажа — к своему стилю, уверенной работе и сильным проектам.</h2>
      <div className="steps-road">
        <article><b>1</b><div><h3>Освой экран</h3><p>Установка, новый проект, файлы, экран программы, лента монтажа и сохранение видео.</p></div></article>
        <article><b>2</b><div><h3>Собери основу</h3><p>Чистые склейки, яркое начало, темп, звук, субтитры и дополнительные кадры.</p></div></article>
        <article><b>3</b><div><h3>Сделай свой ролик</h3><p>Идея, съёмка, монтаж, проверка файла и разбор понятным языком.</p></div></article>
        <article><b>4</b><div><h3>Начни работать</h3><p>Задание, цена, правки, свои работы и профессиональные программы.</p></div></article>
      </div>
    </section>

    <section className="section shell difference-section">
      <div className="section-kicker">КАК ВСЁ СВЯЗАНО</div>
      <h2>Каждый раздел помогает сделать следующий шаг</h2>
      <div className="difference-grid">
        <article><span>Урок</span><p>Короткое объяснение и картинка с нужной кнопкой.</p><b>Дальше</b><p>Маленькое задание закрепляет новый навык.</p></article>
        <article><span>Практика</span><p>Тренировка на понятном примере заказчика.</p><b>Дальше</b><p>Готовая работа пополняет твою личную страницу.</p></article>
        <article><span>Помощник</span><p>Помнит разговор, текущий урок и выбранную программу.</p><b>Дальше</b><p>Разбирает твой файл и ставит правки по важности.</p></article>
        <article><span>Работа</span><p>Компания выбирает уровень специалиста и сравнивает навыки, опыт и портфолио.</p><b>Дальше</b><p>После выбора открывается закрытый чат внутри KIVRONIX.</p></article>
      </div>
      <p className="honest-claim">Наша цель проста: дать самый понятный связанный путь от первой кнопки до первой сильной работы.</p>
    </section>

    <section className="community-vision-band">
      <div className="shell community-vision-grid"><div><div className="section-kicker">БОЛЬШЕ, ЧЕМ КУРС</div><h2>Сообщество монтажёров и компаний</h2><p>Внутри есть профили, друзья, группы, рейтинги, команды школ, соревнования и безопасные рабочие чаты. Каждый пользователь выбирает удобный темп и свой путь.</p></div><div className="community-metrics"><div><strong>1</strong><span>единый профиль</span></div><div><strong>3</strong><span>рейтинга: общий, друзья, школы</span></div><div><strong>24/7</strong><span>помощник рядом в обучении</span></div></div></div>
    </section>

    <section className="section shell creator-ads-section">
      <div className="creator-ads-copy"><div className="section-kicker">ПРОГРАММА ДЛЯ КРЕАТОРОВ</div><h2>Мы открыты к сотрудничеству с блогерами и авторами</h2>
      <p className="section-lead">Сними честный ролик о том, как KIVRONIX помогает учиться монтажу, искать специалистов или выпускать контент. Выбери готовый бриф, опубликуй видео и отправь ссылку — мы проверим размещение и начислим указанную награду.</p></div>
      <div className="creator-program-flow"><article><b>01</b><h3>Выбери тему</h3><p>Готовый бриф объясняет, что показать в ролике, какие факты обязательны и чего нельзя обещать аудитории.</p></article><article><b>02</b><h3>Сними по‑своему</h3><p>Сохрани собственный стиль и честное мнение. Можно показать сайт, личный кабинет, урок или путь от задачи до монтажёра.</p></article><article><b>03</b><h3>Получи награду</h3><p>После модерации и проверки публикации награда появится в кабинете. Условия и критерии видны до участия.</p></article></div>
      <div className="creator-program-cta"><p><strong>Не останавливайся — твой следующий ролик может привести сюда нового автора.</strong><span>Для участия нужен аккаунт блогера и подтверждённая публичная страница.</span></p><Link className="btn btn-dark" href="/signup/creator">Стать креатором</Link><Link className="btn btn-ghost" href="/creators">Посмотреть брифы</Link></div>
    </section>

    <section id="safety" className="section shell safety-home">
      <div className="section-kicker">БЕЗОПАСНОСТЬ И ЧЕСТНОСТЬ</div>
      <h2>Личные данные остаются под защитой</h2>
      <div className="safety-grid">
        <article><h3>Закрытый чат</h3><p>Разговор видят только компания и выбранный монтажёр. Телефоны, электронная почта, ссылки, адреса страниц и мессенджеры остаются за пределами чата.</p></article>
        <article><h3>Подростки</h3><p>Школа скрыта по умолчанию. Коммерция и денежный конкурс до 18 лет открываются после подтверждения взрослого.</p></article>
        <article><h3>Компании</h3><p>Настоящие вакансии и задания публикуются после проверки компании. Победителя выбирают люди по открытым правилам.</p></article>
      </div>
    </section>

    <section className="section shell">
      <div className="section-kicker">ОТЗЫВЫ</div>
      <h2>Только настоящие</h2>
      {testimonials.length?<div className="testimonial-grid">{testimonials.map((t:any,i:number)=><article className="testimonial-card" key={i}><div className="stars">{"★".repeat(Math.max(1,Math.min(5,Number(t.rating||5))))}</div><p>«{t.text}»</p><b>{t.display_name}</b><span>{t.role_label}</span></article>)}</div>:<div className="honest-empty"><b>Первые отзывы скоро появятся.</b><p>Здесь будут только тексты реальных пользователей, которые разрешили публикацию.</p></div>}
    </section>

    <section className="section shell faq-section">
      <div className="section-kicker">ВОПРОСЫ ПЕРЕД СТАРТОМ</div>
      <h2>Короткие и понятные ответы</h2>
      <div className="faq-grid">{faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>

    <section className="final-cta"><div className="shell"><div className="eyebrow">KIVRONIX · БЕСПЛАТНО</div><h2>Начни учиться или найди профессионального монтажёра</h2><p>Создание аккаунта занимает несколько минут. Банковская карта не требуется.</p><div className="hero-actions"><Link className="btn btn-lime" href="/signup/editor">Создать аккаунт</Link><Link className="btn btn-light" href="/signup/business">Кабинет компании</Link></div></div></section>

    <SiteFooter/>
  </main>;
}
