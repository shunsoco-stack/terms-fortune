import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — 今日の運勢は、規約に書いてある。`,
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["利用規約占い", "占い", "日替わり占い", "パロディ", "今日の運勢"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", locale: "ja_JP", url: "/", siteName: SITE_NAME,
    title: `${SITE_NAME}｜今日の運勢は、規約に書いてある。`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "利用規約占い。今日の運勢は、規約に書いてある。" }],
  },
  twitter: {
    card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION, images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f3ec" }, { media: "(prefers-color-scheme: dark)", color: "#18221e" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <Script id="theme-initializer" strategy="beforeInteractive">{`try{var t=localStorage.getItem('terms-fortune:theme:v1');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}`}</Script>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
