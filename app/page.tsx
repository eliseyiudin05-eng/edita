import Link from "next/link";
import {getSupabasePublicConfig} from "@/lib/public-config";
import {createClient} from "@supabase/supabase-js";
import SiteFooter from "@/components/site-footer";

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
  ["Академия","Первые уроки начинаются с нуля: что такое монтаж, хук, ритм, B-roll, CTA и ТЗ."],
  ["AI Помощник","Можно спросить обычными словами. Он объясняет термины и подсказывает следующий шаг."],
  ["Практика","Тренируй ответы клиенту: цена, сроки, правки и вопросы до начала работы."],
  ["Разбор видео","Загрузи ролик и получи понятный список, что стоит улучшить."],
  ["Arena","Проверенные компании дают одинаковое ТЗ участникам. Победителя выбирает человек, не AI."],
  ["Портфолио и работа","Собирай лучшие работы и откликайся на вакансии внутри одной системы."]
];

const faq=[
  ["Я вообще не умею монтировать. Мне подойдёт?","Да. Первые пять уроков сделаны именно для человека, который только начинает и ещё не знает профессиональных слов."],
  ["Нужно сразу покупать тариф?","Нет. Сначала можно создать аккаунт, пройти базовую настройку и посмотреть платформу. Платные функции подключаются отдельно."],
  ["AI выберет победителя конкурса?","Нет. AI может дать подсказку и первичный разбор, но победителя выбирает бизнес или человек, который проводит задание."],
  ["Можно ли пользоваться до 18 лет?","Учиться можно. Коммерческие задания, вакансии и оплата закрыты до подтверждения родителя или другого законного представителя."],
  ["Можно ли доверять компаниям?","Реальные Challenge и вакансии могут публиковать только компании, которые прошли проверку EDITA."],
  ["Какие программы поддерживаются?","Маршрут можно настроить под CapCut, Premiere Pro, DaVinci Resolve и Final Cut."]
];

export default async function Home(){
  const testimonials=await getTestimonials();

  return <main className="landing">
    <nav className="topbar shell">
      <Link className="brand" href="/">EDITA<span>.</span></Link>
      <div className="nav-actions">
        <a href="#start">С чего начать</a>
        <a href="#inside">Что внутри</a>
        <a href="#business">Для бизнеса</a><Link href="/creators">Для креаторов</Link>
        <Link href="/pricing">Тарифы</Link>
        <Link href="/login">Войти</Link>
        <Link className="btn btn-dark" href="/signup">Попробовать</Link>
      </div>
    </nav>

    <section className="hero shell hero-new">
      <div className="hero-grid">
        <div>
          <div className="eyebrow">ОТ ПЕРВОГО МОНТАЖА ДО ПЕРВОЙ РАБОТЫ</div>
          <h1>Научись монтировать.<br/><span>Потом покажи, что умеешь.</span></h1>
          <p className="hero-copy">EDITA объясняет монтаж простыми словами, даёт практику, помогает собрать портфолио и приводит к реальным заданиям от проверенных компаний.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/signup">Начать с нуля</Link>
            <a className="btn btn-ghost" href="#start">Посмотреть, как это работает</a>
          </div>
          <div className="simple-proof">
            <span>✓ Первые 5 уроков — теория с нуля</span>
            <span>✓ AI объясняет непонятные слова</span>
            <span>✓ Бизнес проходит проверку</span>
          </div>
        </div>
        <figure className="hero-photo">
          <img src="https://images.unsplash.com/photo-1744686912094-5a25e7c329b6?auto=format&fit=crop&fm=jpg&q=80&w=1600" alt="Рабочее место видеомонтажёра с программой монтажа на экране"/>
          <figcaption>Монтаж — это навык. Его можно разложить на простые шаги.</figcaption>
        </figure>
      </div>
    </section>

    <section id="start" className="section shell">
      <div className="section-kicker">ЕСЛИ ТЫ НОВИЧОК</div>
      <h2>Не нужно сначала учить словарь монтажёра</h2>
      <p className="section-lead">Мы специально начинаем не с эффектов и сложных кнопок, а с понимания: что такое монтаж и зачем вообще нужен каждый приём.</p>
      <div className="steps-road">
        <article><b>1</b><div><h3>Пойми основу</h3><p>Что такое кадр, склейка, хук, ритм, B-roll, CTA и ТЗ — на обычных примерах.</p></div></article>
        <article><b>2</b><div><h3>Попробуй сам</h3><p>После каждого урока есть маленькое задание. Не теория ради теории.</p></div></article>
        <article><b>3</b><div><h3>Спроси AI</h3><p>Если не понял — напиши: «Объясни ещё проще». Помощник не должен стыдить за простые вопросы.</p></div></article>
        <article><b>4</b><div><h3>Собери работу</h3><p>Переходи к настоящим роликам, портфолио и заданиям от бизнеса.</p></div></article>
      </div>
    </section>

    <section className="visual-band">
      <div className="shell visual-grid">
        <figure>
          <img src="https://images.unsplash.com/photo-1639485527766-92d074dcb142?auto=format&fit=crop&fm=jpg&q=80&w=1600" alt="Человек работает за ноутбуком"/>
        </figure>
        <div>
          <div className="section-kicker light">ПОНЯТНО ДАЖЕ В ПЕРВЫЙ ДЕНЬ</div>
          <h2>Не понял слово? Это проблема объяснения, а не твоя.</h2>
          <p>В EDITA сложные слова либо убираются, либо сразу переводятся на обычный язык. Например: <b>B-roll</b> — дополнительный кадр, который показывает то, о чём сейчас говорят.</p>
          <Link className="btn btn-light" href="/signup">Получить свой маршрут</Link>
        </div>
      </div>
    </section>

    <section id="inside" className="section shell">
      <div className="section-kicker">ЧТО ЕСТЬ ВНУТРИ</div>
      <h2>Один путь вместо десяти разных сервисов</h2>
      <div className="feature-grid">{features.map(([title,text])=><article className="feature-card" key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="section shell">
      <div className="section-kicker">КАК ВЫГЛЯДИТ ПЕРВЫЙ ДЕНЬ</div>
      <h2>Человек вошёл — и сразу понимает, куда нажать</h2>
      <div className="first-day-grid">
        <div className="first-day-card"><span>09:00</span><b>Прошёл подсказки по сайту</b><p>EDITA показывает Главную, Академию, Практику, AI, Arena, Портфолио и Работу.</p></div>
        <div className="first-day-card"><span>09:10</span><b>Узнал, что такое монтаж</b><p>Первый урок объясняет кадр, склейку и таймлайн без сложной теории.</p></div>
        <div className="first-day-card"><span>09:25</span><b>Разобрался с хуком</b><p>Понял, почему первые секунды ролика важны и придумал три варианта начала.</p></div>
        <div className="first-day-card"><span>09:45</span><b>Задал вопрос AI</b><p>Получил шаги под свою программу монтажа и понял, что делать дальше.</p></div>
      </div>
    </section>

    <section id="business" className="business-band">
      <div className="shell business-grid business-new">
        <div>
          <div className="section-kicker light">ДЛЯ КОМПАНИЙ</div>
          <h2>Смотрите не на резюме.<br/>Смотрите на реальную работу.</h2>
          <p>Компания подтверждает себя, создаёт понятное задание, получает работы монтажёров и сама выбирает лучшего человека.</p>
          <div className="verification-explain">
            <span>✓ Проверенная компания — документы сверены</span>
            <span>★ Известный бренд — документы + публичные страницы проверены вручную</span>
          </div>
        </div>
        <div className="business-card">
          <h3>Почему нужна проверка</h3>
          <p>Она нужна не для красивой галочки. Непроверенный бизнес не может публиковать реальную вакансию или Challenge. Так меньше фейковых работодателей и ложных призов.</p>
          <Link href="/signup" className="btn btn-light">Создать бизнес-аккаунт</Link>
        </div>
      </div>
    </section>

    <section id="creators" className="creator-home-band">
      <div className="shell creator-home-grid">
        <div>
          <div className="section-kicker">ДЛЯ КРЕАТОРОВ</div>
          <h2>Снимай про EDITA и получай реальные оплачиваемые брифы</h2>
          <p>Мы собираем постоянную Creator Squad: монтажёров, UGC-креаторов и авторов коротких видео. Сначала согласуем оплату и условия, потом начинается работа.</p>
          <Link className="btn btn-dark" href="/creators">Открыть EDITA Creators</Link>
        </div>
        <div className="creator-home-card">
          <span className="eyebrow">ПЕРВОЕ ОФИЦИАЛЬНОЕ ТЗ</span>
          <h3>«EDITA глазами новичка»</h3>
          <p>Вертикальное видео 25–45 секунд: честно показать, как человек впервые заходит в EDITA и начинает понимать монтаж.</p>
          <b>Никакой обязательной бесплатной работы.</b>
        </div>
      </div>
    </section>

    <section className="section shell safety-home">
      <div className="section-kicker">БЕЗОПАСНОСТЬ</div>
      <h2>До 18 лет — обучение сначала, коммерция только после подтверждения взрослого</h2>
      <div className="safety-grid">
        <article><h3>Можно сразу</h3><p>Уроки, практика, AI Помощник и развитие навыков.</p></article>
        <article><h3>Требует подтверждения</h3><p>Оплата, отклик на работу и участие в коммерческих заданиях.</p></article>
        <article><h3>Паспорт ребёнка</h3><p>Мы не хотим хранить его в обычной базе. Для публичного запуска проверку личности родителя нужно вынести в специализированный сервис.</p></article>
      </div>
    </section>

    <section className="section shell price-preview">
      <div><div className="section-kicker">ТАРИФЫ</div><h2>Сначала разберись. Потом решай, нужно ли больше.</h2></div>
      <div className="price-preview-grid">
        <article><span>START</span><strong>1 490 ₽</strong><p>Стартовая программа и путь от базы к первым работам.</p></article>
        <article><span>AI PRO · 30 ДНЕЙ</span><strong>499 ₽</strong><p>Расширенный AI и полный разбор видео. Без автоматического продления.</p></article>
      </div>
      <Link className="btn btn-dark" href="/pricing">Все тарифы</Link>
    </section>

    <section className="section shell">
      <div className="section-kicker">ОТЗЫВЫ</div>
      <h2>Только настоящие</h2>
      {testimonials.length?<div className="testimonial-grid">{testimonials.map((t:any,i:number)=><article className="testimonial-card" key={i}><div className="stars">{"★".repeat(Math.max(1,Math.min(5,Number(t.rating||5))))}</div><p>«{t.text}»</p><b>{t.display_name}</b><span>{t.role_label}</span></article>)}</div>:<div className="honest-empty"><b>Пока здесь пусто — и это нормально.</b><p>Мы не будем писать выдуманные отзывы. Во время закрытого предзапуска соберём реальные отзывы тестировщиков, и только после их разрешения они появятся здесь.</p></div>}
    </section>

    <section className="section shell faq-section">
      <div className="section-kicker">ВОПРОСЫ</div>
      <h2>Если бы я впервые открыл EDITA</h2>
      <div className="faq-grid">{faq.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
    </section>

    <section className="final-cta">
      <div className="shell">
        <div className="eyebrow">EDITA</div>
        <h2>Открой сайт. Пройди первый урок. Сделай первый монтаж.</h2>
        <p>Не нужно уже быть монтажёром, чтобы начать.</p>
        <Link className="btn btn-lime" href="/signup">Начать</Link>
      </div>
    </section>

    <SiteFooter/>
  </main>
}
