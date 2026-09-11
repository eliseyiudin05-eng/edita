import Link from "next/link";

export default function SiteFooter(){
  return <footer className="site-footer"><div className="shell footer-grid">
    <div><Link className="brand" href="/">EDITA<span>.</span></Link><p>Learn. Compete. Earn.</p></div>
    <div><b>Продукт</b><Link href="/pricing">Тарифы</Link><Link href="/platform">Демо</Link><Link href="/u/demo">Портфолио</Link><Link href="/status">Статус</Link></div>
    <div><b>Документы</b><Link href="/terms">Условия</Link><Link href="/privacy">Privacy</Link><Link href="/offer">Оплата</Link><Link href="/arena-rules">Arena</Link><Link href="/requisites">Реквизиты</Link></div>
  </div></footer>
}
