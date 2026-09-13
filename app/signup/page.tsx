import Link from "next/link";

export default function SignupChooser(){
  return <main className="auth-wrap"><section className="auth-card signup-chooser">
    <div className="eyebrow">РЕГИСТРАЦИЯ</div>
    <h1>Кто ты?</h1>
    <p>Выбери один вариант. Дальше будут только те вопросы, которые нужны именно тебе.</p>

    <div className="signup-paths">
      <Link className="signup-path" href="/signup/editor">
        <span className="signup-icon">✂</span>
        <div><b>Я монтажёр</b><p>Хочу учиться, делать ролики, показывать свои работы и находить заказы.</p><span>Регистрация монтажёра →</span></div>
      </Link>
      <Link className="signup-path" href="/signup/business">
        <span className="signup-icon">B</span>
        <div><b>Я представляю бизнес</b><p>Хочу дать задание, найти монтажёра или опубликовать вакансию.</p><span>Регистрация бизнеса →</span></div>
      </Link>
      <Link className="signup-path" href="/signup/creator">
        <span className="signup-icon">@</span>
        <div><b>Мне нужен монтажёр</b><p>Я блогер, эксперт или автор. Хочу ставить задания на Reels, TikTok и Shorts и общаться с исполнителем.</p><span>Регистрация заказчика →</span></div>
      </Link>
    </div>

    <div className="auth-msg"><b>Важно:</b> компании подтверждают документы, а частные заказчики — публичный аккаунт в социальной сети. До проверки публиковать задания нельзя.</div>
    <div className="auth-footer">Уже есть аккаунт? <Link href="/login"><b>Войти</b></Link></div>
  </section></main>
}
