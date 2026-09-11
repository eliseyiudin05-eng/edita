import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDITA — Learn. Compete. Earn.",
  description: "AI-платформа, где видеомонтажёры учатся, соревнуются и находят реальную работу.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
