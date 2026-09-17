import type { Metadata, Viewport } from "next";
import "./globals.css";
import CookieNotice from "@/components/cookie-notice";
import BackToTop from "@/components/back-to-top";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";

const siteUrl=KIVRONIX_SITE_URL;
const siteTitle="KIVRONIX — обучение видеомонтажу, профессиональный рост и поиск монтажёров для блогеров и компаний";
const siteDescription="KIVRONIX — обучение видеомонтажу, профессиональный рост и поиск монтажёров для блогеров и компаний.";

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
    default:siteTitle,
    template:"%s · KIVRONIX",
  },
  description:siteDescription,
  applicationName:"KIVRONIX",
  keywords:["обучение видеомонтажу","монтаж видео с нуля","профессиональный видеомонтажёр","найти монтажёра для компании","работа видеомонтажёром","KIVRONIX"],
  authors:[{name:"KIVRONIX",url:siteUrl}],
  creator:"KIVRONIX",
  publisher:"KIVRONIX",
  category:"education",
  manifest:"/manifest.webmanifest",
  openGraph:{
    title:siteTitle,
    description:siteDescription,
    url:siteUrl,
    siteName:"KIVRONIX",
    locale:"ru_RU",
    type:"website",
    images:[{url:"/images/kivronix-frog-mark.png",width:384,height:384,alt:"Логотип KIVRONIX — лягушка с символом видео"}],
  },
  twitter:{
    card:"summary_large_image",
    title:siteTitle,
    description:siteDescription,
    images:["/images/kivronix-frog-mark.png"],
  },
  icons:{
    icon:[
      {url:"/favicon.ico",sizes:"any"},
      {url:"/icon.png",type:"image/png",sizes:"512x512"},
    ],
    shortcut:"/favicon.ico",
    apple:"/apple-icon.png",
  },
  verification:{
    google:"ZLKhQUkAlr1PwVmsfQL6_Bx3IFIBvbbIjZHSaZh26uI",
    yandex:"189ef5499fda2b5d",
  },
  appleWebApp:{capable:true,title:"KIVRONIX",statusBarStyle:"black-translucent"},
  robots:{index:true,follow:true,googleBot:{index:true,follow:true}},
};

export const viewport: Viewport = {
  width:"device-width",
  initialScale:1,
  viewportFit:"cover",
  themeColor:"#171816",
  colorScheme:"light",
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
        image:`${siteUrl}/images/kivronix-frog-mark.png`,
        inLanguage:"ru-RU",
        isAccessibleForFree:true,
      },
      {
        "@type":"EducationalOrganization",
        name:"KIVRONIX",
        url:siteUrl,
        logo:{
          "@type":"ImageObject",
          url:`${siteUrl}/images/kivronix-frog-mark.png`,
          width:384,
          height:384,
        },
        image:`${siteUrl}/images/kivronix-frog-mark.png`,
        description:siteDescription,
      },
    ],
  };

  return <html lang="ru"><body><style data-kivronix-fallback dangerouslySetInnerHTML={{__html:fallbackStyles}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData)}}/>{children}<BackToTop/><CookieNotice/></body></html>;
}
