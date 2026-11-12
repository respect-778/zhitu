import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { resolveLocale } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/client";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deepinterview.ai",
  ),
  title: {
    default: "DeepInterview · AI 模拟面试",
    template: "%s · DeepInterview",
  },
  description:
    "Open-source, voice-first AI mock interviews. DeepInterview reads your CV and the job, researches the company, runs an adaptive voice interview, then shows you exactly what to fix. English-first, 10+ languages.",
  applicationName: "DeepInterview",
  openGraph: {
    title: "DeepInterview — Practice the interview out loud",
    description:
      "Open-source, voice-first AI mock interviews — practice out loud, then pass the real one.",
    url: "/",
    siteName: "DeepInterview",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DeepInterview — Practice the interview out loud",
    description:
      "Open-source, voice-first AI mock interviews — practice out loud, then pass the real one.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Share the persisted locale with every client component and the document language.
  const store = await cookies();
  const locale = resolveLocale(store.get("locale")?.value);
  // Translation extensions inject theme attributes before React hydrates.
  return (
    <html
      suppressHydrationWarning
      lang={locale === "zh" ? "zh-CN" : locale}
      className={`${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body className="font-sans">
        <noscript>
          <style
            dangerouslySetInnerHTML={{
              __html: ".reveal{opacity:1!important;transform:none!important}",
            }}
          />
        </noscript>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
