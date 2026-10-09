import "../globals.css";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, localeDirection, type Locale } from "@/i18n/routing";
import PwaRegister from "@/components/pwa/pwa-register";
import NavProgress from "@/components/pwa/nav-progress";

export const metadata: Metadata = {
  title: {
    default: "Gestion Scolaire",
    template: "%s · Gestion Scolaire",
  },
  description: "Gestion d'école privée : élèves, enseignants, cours, finances",
  applicationName: "Gestion Scolaire",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "MaxSchool",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c2740" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={localeDirection[locale as Locale]}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.theme==="dark"||(!localStorage.theme&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <NextIntlClientProvider>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          {children}
        </NextIntlClientProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
