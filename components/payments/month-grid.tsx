"use client";

import { useLocale, useTranslations } from "next-intl";
import type { DueMonth } from "@/lib/dues";

// Libellé court d'un mois ("sept. 26"). Tamaziɣt n'étant pas connue du
// navigateur, on retombe sur le français pour les noms de mois.
export function useMonthLabel() {
  const locale = useLocale();
  const fmt = new Intl.DateTimeFormat(locale === "tzm" ? "fr" : locale, {
    month: "short",
    year: "2-digit",
  });
  const fmtLong = new Intl.DateTimeFormat(locale === "tzm" ? "fr" : locale, {
    month: "long",
    year: "numeric",
  });
  return {
    short: (period: string) => fmt.format(new Date(`${period}-01T12:00:00`)),
    long: (period: string) => fmtLong.format(new Date(`${period}-01T12:00:00`)),
  };
}

export const STATUS_STYLES: Record<DueMonth["status"], string> = {
  paid: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  unpaid:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  upcoming:
    "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500",
};

// Grille des mois de l'année scolaire, un pavé par mois avec son statut.
// `onPick` rend les pavés cliquables (admin : choisir le mois à encaisser).
export default function MonthGrid({
  months,
  selected,
  onPick,
}: {
  months: DueMonth[];
  selected?: string;
  onPick?: (m: DueMonth) => void;
}) {
  const t = useTranslations("payments");
  const label = useMonthLabel();

  if (months.length === 0) {
    return <p className="text-sm text-slate-400">{t("noFee")}</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {months.map((m) => {
        const Tag = onPick ? "button" : "div";
        return (
          <Tag
            key={m.period}
            type={onPick ? "button" : undefined}
            onClick={onPick ? () => onPick(m) : undefined}
            title={`${label.long(m.period)} — ${t(`status_${m.status}`)}`}
            className={`rounded-md border px-2 py-1.5 text-start text-xs ${STATUS_STYLES[m.status]} ${
              selected === m.period ? "ring-2 ring-indigo-500" : ""
            } ${onPick ? "cursor-pointer hover:opacity-80" : ""}`}
          >
            <div className="font-semibold capitalize">{label.short(m.period)}</div>
            <div dir="ltr" className="mt-0.5 tabular-nums">
              {m.status === "paid"
                ? "✓"
                : m.status === "upcoming"
                  ? m.due.toLocaleString()
                  : `-${m.remaining.toLocaleString()}`}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
