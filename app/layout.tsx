import type { Metadata } from "next";
import "./globals.css";
import CookieNotice from "@/components/cookie-notice";
import BackToTop from "@/components/back-to-top";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";

const siteUrl=KIVRONIX_SITE_URL;
const siteDescription="KIVRONIX объединяет обучение видеомонтажу, портфолио, проекты и безопасное сотрудничество. Новички осваивают профессию, монтажёры находят заказчиков, а блогеры и компании выбирают специалистов по уровню и работам.";

// A small inline safety net keeps the platform readable when a browser, VPN,
// or stale cache temporarily fails to download Next.js' hashed CSS bundle.
// :where() keeps every selector at zero specificity, so globals.css wins as
// soon as the full stylesheet is available.
const fallbackStyles=`
:where(*){box-sizing:border-box}
:where(body){margin:0;background:#f5f5f2;color:#111;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.5}
:where(a){color:inherit;text-decoration:none}
:where(button,input,select,textarea){font:inherit}
:where(.app){min-height:100vh;display:grid;grid-template-columns:220px 1fr}
:where(.side){background:#171816;color:#fff;padding:24px 16px;display:flex;flex-direction:column}
:where(.side .brand){padding:0 10px 22px;font-size:26px;font-weight:900}
:where(.nav){display:flex;flex-direction:column;gap:4px}
:where(.nav button){border:0;background:transparent;color:#aaa;padding:12px;border-radius:10px;text-align:left}
:where(.nav button.active){background:#2b2c28;color:#fff}
:where(.profile){margin-top:auto;border-top:1px solid #32332e;padding-top:18px;font-size:13px}
:where(.main){min-width:0}
:where(.head){height:64px;border-bottom:1px solid #dedfd8;display:flex;justify-content:flex-end;align-items:center;padding:0 30px}
:where(.page){max-width:1180px;margin:auto;padding:40px}
:where(.page h1){font-size:40px;letter-spacing:-2px;margin:0 0 10px}
:where(.sub,.muted){color:#6f716b}
:where(.mission){background:#786bf2;color:#fff;border-radius:24px;padding:30px;margin-bottom:18px}
:where(.mission h2){font-size:34px;margin:8px 0}
:where(.grid){display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
:where(.card){background:#fff;border:1px solid #dedfd8;border-radius:18px;padding:20px}
:where(.stats){display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
:where(.stat){background:#ecece7;border-radius:14px;padding:16px}
:where(.stat strong){display:block;font-size:26px}
:where(.btn){border:0;border-radius:12px;padding:12px 17px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
:where(.btn-dark){background:#171816;color:#fff}
:where(.btn-lime,.btn-primary){background:#d8ff3e;color:#111}
:where(.btn-ghost){background:transparent;border:1px solid #dedfd8}
:where(.mobile){display:none}
@media(max-width:900px){
  :where(.app){display:block}
  :where(.side){display:none}
  :where(.page){padding:24px 14px}
  :where(.grid){grid-template-columns:1fr}
  :where(.head){justify-content:space-between}
  :where(.mobile){display:block}
  :where(h1,h2,h3,.page h1){letter-spacing:normal;line-height:1.12}
}
`;

export const metadata: Metadata = {
  metadataBase:new URL(siteUrl),
  title:{
    default:"KIVRONIX — обучение и поиск монтажёров",
    template:"%s · KIVRONIX",
  },
  description:siteDescription,
  applicationName:"KIVRONIX",
  keywords:["обучение видеомонтажу","монтаж видео с нуля","профессиональный видеомонтажёр","найти монтажёра","работа видеомонтажёром","KIVRONIX"],
  authors:[{name:"KIVRONIX",url:siteUrl}],
  creator:"KIVRONIX",
  publisher:"KIVRONIX",
  category:"education",
  alternates:{canonical:"/"},
  manifest:"/manifest.webmanifest",
  openGraph:{
    title:"KIVRONIX — обучение и профессиональные монтажёры",
    description:siteDescription,
    url:siteUrl,
    siteName:"KIVRONIX",
    locale:"ru_RU",
    type:"website",
    images:[{url:"/images/kivronix-search-card.png",width:1200,height:630,alt:"KIVRONIX — монтаж с нуля"}],
  },
  twitter:{
    card:"summary_large_image",
    title:"KIVRONIX — обучение и профессиональные монтажёры",
    description:siteDescription,
    images:["/images/kivronix-search-card.png"],
  },
  icons:{icon:"/icon.png",apple:"/apple-icon.png"},
  robots:{index:true,follow:true,googleBot:{index:true,follow:true}},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData={
    "@context":"https://schema.org",
    "@graph":[
      {
        "@type":"WebSite",
        name:"KIVRONIX",
        url:siteUrl,
        description:siteDescription,
        inLanguage:"ru-RU",
        isAccessibleForFree:true,
      },
      {
        "@type":"EducationalOrganization",
        name:"KIVRONIX",
        url:siteUrl,
        logo:`${siteUrl}/images/kivronix-frog-logo.png`,
        description:"Платформа для обучения видеомонтажу, поиска специалистов и совместной работы монтажёров, блогеров и компаний.",
      },
    ],
  };

  return <html lang="ru"><body><style data-kivronix-fallback dangerouslySetInnerHTML={{__html:fallbackStyles}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData)}}/>{children}<BackToTop/><CookieNotice/></body></html>;
}
