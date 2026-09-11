import type { Metadata } from "next";
import "./globals.css";

const siteUrl=process.env.NEXT_PUBLIC_SITE_URL || "https://getedita.app";

export const metadata: Metadata = {
  metadataBase:new URL(siteUrl),
  title:{
    default:"EDITA — Learn. Compete. Earn.",
    template:"%s · EDITA",
  },
  description:"AI-платформа, где видеомонтажёры учатся, получают AI-разбор, собирают портфолио, соревнуются и находят реальную работу.",
  openGraph:{
    title:"EDITA — Learn. Compete. Earn.",
    description:"От первого монтажа до реального клиента — в одной системе.",
    url:siteUrl,
    siteName:"EDITA",
    locale:"ru_RU",
    type:"website",
  },
  robots:{index:true,follow:true},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
