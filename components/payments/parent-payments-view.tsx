"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Printer, CheckCircle2, AlertCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import MonthGrid, { useMonthLabel } from "@/components/payments/month-grid";
import type { PaymentRow, StudentFees } from "@/components/payments/payments-view";

// ---------------------------------------------------------------------
//  Espace parent : une fiche par enfant.
//    - tarif mensuel fixé par l'école ;
//    - grille des mois (payé / partiel / impayé / à venir) ;
//    - reste à payer à ce jour ;
//    - historique des versements, chacun avec son bon imprimable.
// ---------------------------------------------------------------------
export default function ParentPaymentsView({
  students,
  payments,
  today,
}: {
  students: StudentFees[];
  payments: PaymentRow[];
  today: string;
}) {
  const t = useTranslations("payments");
  const tn = useTranslations("nav");
  const tr = useTranslations("receipt");
  const label = useMonthLabel();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{tn("payments")}</h1>

      {students.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          {t("noChild")}
        </div>
      )}

      <div className="space-y-6">
        {students.map((s) => {
          const acc = s.account;
          const mine = payments.filter((p) => p.student_id === s.id);
          const thisMonth = acc.months.find((m) => m.period === today);
          return (
            <section
              key={s.id}
              className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{s.name}</h2>
                  {s.className && (
                    <p className="text-sm text-slate-500">
                      {t("class")} : {s.className}
                    </p>
                  )}
                </div>
                {acc.remaining > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                    <AlertCircle className="h-4 w-4" />
                    {t("remainingToDate")} : <span dir="ltr">{formatMoney(acc.remaining)}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4" />
                    {t("upToDate")}
                  </span>
                )}
              </div>

              <div className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <Stat label={t("monthlyFee")} value={formatMoney(acc.monthlyFee)} />
                <Stat
                  label={`${t("thisMonth")} (${label.long(today)})`}
                  value={
                    thisMonth
                      ? thisMonth.remaining > 0
                        ? `${t("remaining")} ${formatMoney(thisMonth.remaining)}`
                        : t("status_paid")
                      : "—"
                  }
                />
                <Stat label={t("paidThisYear")} value={formatMoney(acc.totalPaid)} />
              </div>

              <MonthGrid months={acc.months} />

              <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t("history")}
              </h3>
              {mine.length === 0 ? (
                <p className="text-sm text-slate-400">{t("empty")}</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mine.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <span className="w-24 text-slate-500" dir="ltr">
                        {p.paid_at}
                      </span>
                      <span className="flex-1 capitalize">
                        {t(`type_${p.type}`)}
                        {p.period && ` — ${label.long(p.period)}`}
                      </span>
                      <span className="font-semibold" dir="ltr">
                        {formatMoney(p.amount)}
                      </span>
                      <Link
                        href={`/recu/paiement/${p.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {tr("short")}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold" dir="auto">
        {value}
      </div>
    </div>
  );
}
