import type { Metadata } from "next";
import "./globals.css";
import CookieNotice from "@/components/cookie-notice";

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL || "https://getedita.app";

export const metadata: Metadata = {
  metadataBase:new URL(siteUrl),
  title:{
    default:"EDITA — от первого монтажа до первой работы",
    template:"%s · EDITA",
  },
  description:"Бесплатная и понятная платформа для видеомонтажёров: обучение с нуля, помощник, практика, свои работы, задания и работа.",
  openGraph:{
    title:"EDITA — учись монтажу и собирай карьеру",
    description:"Простое бесплатное обучение, помощник, практика и настоящие задания в одной системе.",
    url:siteUrl,
    siteName:"EDITA",
    locale:"ru_RU",
    type:"website",
  },
  robots:{index:true,follow:true},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}<CookieNotice/></body></html>;
}
