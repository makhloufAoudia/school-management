"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Printer, Info } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { SalaryRow } from "@/components/finance/salaries-view";

// Écran de l'enseignant : ses propres paiements, en lecture seule.
// La base ne lui renvoie de toute façon que ses lignes (policy
// « teacher own salaries ») — l'écran ne fait que les présenter.
export default function MySalariesView({ salaries }: { salaries: SalaryRow[] }) {
  const t = useTranslations("salaries");
  const tp = useTranslations("payments");

  const [yearFilter, setYearFilter] = useState("");

  const years = useMemo(
    () =>
      Array.from(new Set(salaries.map((s) => s.period.slice(0, 4))))
        .filter(Boolean)
        .sort()
        .reverse(),
    [salaries]
  );

  const filtered = useMemo(
    () =>
      yearFilter
        ? salaries.filter((s) => s.period.startsWith(yearFilter))
        : salaries,
    [salaries, yearFilter]
  );

  const total = useMemo(
    () => filtered.reduce((sum, s) => sum + Number(s.amount), 0),
    [filtered]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {t("myTitle")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({filtered.length})
          </span>
        </h1>
        {years.length > 1 && (
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="">{t("allYears")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {salaries.length === 0 ? (
        <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">{t("myEmptyTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed">{t("myEmptyHelp")}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm font-medium">
            {tp("total")} : {formatMoney(total)}
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{tp("period")}</th>
                  <th className="px-4 py-3 text-start font-medium">{tp("amount")}</th>
                  <th className="px-4 py-3 text-start font-medium">{tp("method")}</th>
                  <th className="px-4 py-3 text-start font-medium">{tp("date")}</th>
                  <th className="px-4 py-3 text-start font-medium">{tp("notes")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("receipt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">{s.period}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(s.amount)}</td>
                    <td className="px-4 py-3">{tp(`method_${s.method}`)}</td>
                    <td className="px-4 py-3">{s.paid_at}</td>
                    <td className="px-4 py-3 text-slate-500">{s.notes ?? ""}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Link
                          href={`/recu/salaire/${s.id}`}
                          target="_blank"
                          title={t("print")}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-600"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          {t("print")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
