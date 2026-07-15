import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "ar", "tzm", "en"],
  defaultLocale: "fr",
});

export type Locale = (typeof routing.locales)[number];

// Direction du texte par langue (l'arabe est RTL)
export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  fr: "ltr",
  ar: "rtl",
  tzm: "ltr",
  en: "ltr",
};

export const localeNames: Record<Locale, string> = {
  fr: "Français",
  ar: "العربية",
  tzm: "Tamaziɣt",
  en: "English",
};
