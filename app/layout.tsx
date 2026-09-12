import type { Metadata } from "next";
import "./globals.css";
import CookieNotice from "@/components/cookie-notice";

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL || "https://getedita.app";
const siteDescription="Бесплатная платформа для тех, кто хочет научиться монтировать видео с нуля. Простые уроки, задания, помощник, разбор роликов, конкурсы и вакансии.";

export const metadata: Metadata = {
  metadataBase:new URL(siteUrl),
  title:{
    default:"EDITA — бесплатное обучение видеомонтажу с нуля",
    template:"%s · EDITA",
  },
  description:siteDescription,
  applicationName:"EDITA",
  keywords:["обучение видеомонтажу","монтаж видео с нуля","бесплатные уроки монтажа","работа видеомонтажёром","EDITA"],
  authors:[{name:"EDITA",url:siteUrl}],
  creator:"EDITA",
  publisher:"EDITA",
  category:"education",
  alternates:{canonical:"/"},
  manifest:"/manifest.webmanifest",
  openGraph:{
    title:"EDITA — научись монтировать видео бесплатно",
    description:siteDescription,
    url:siteUrl,
    siteName:"EDITA",
    locale:"ru_RU",
    type:"website",
    images:[{url:"/images/edita-search-card.png",width:1200,height:630,alt:"EDITA — монтаж с нуля бесплатно"}],
  },
  twitter:{
    card:"summary_large_image",
    title:"EDITA — научись монтировать видео бесплатно",
    description:siteDescription,
    images:["/images/edita-search-card.png"],
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
        name:"EDITA",
        url:siteUrl,
        description:siteDescription,
        inLanguage:"ru-RU",
        isAccessibleForFree:true,
      },
      {
        "@type":"EducationalOrganization",
        name:"EDITA",
        url:siteUrl,
        logo:`${siteUrl}/images/edita-logo-mark.png`,
        description:"Платформа для понятного обучения видеомонтажу и первых рабочих проектов.",
      },
    ],
  };

  return <html lang="ru"><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData)}}/>{children}<CookieNotice/></body></html>;
}
