"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Plus,
  Trash2,
  Search,
  Banknote,
  List,
  CalendarCheck,
  Printer,
  CheckCircle2,
} from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect, FloatTextarea } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { confirmDelete } from "@/lib/swal";
import { savePayment, deletePayment } from "@/lib/actions/payments";
import { formatMoney } from "@/lib/format";
import type { StudentAccount } from "@/lib/dues";
import MonthGrid, { useMonthLabel, STATUS_STYLES } from "@/components/payments/month-grid";

export type PaymentRow = {
  id: string;
  student_id: string;
  amount: number;
  type: "tuition" | "registration" | "transport" | "canteen" | "other";
  method: "cash" | "check" | "transfer" | "card";
  period: string | null;
  paid_at: string;
  notes: string | null;
  students: {
    first_name: string;
    last_name: string;
    class_id: string | null;
    classes: { name: string } | null;
  } | null;
};

// Un élève et son compte de mensualités (calculé côté serveur, lib/dues.ts).
export type StudentFees = {
  id: string;
  name: string;
  classId: string | null;
  className: string | null;
  account: StudentAccount;
};

export type ClassOption = { id: string; name: string };

const TYPES = ["tuition", "registration", "transport", "canteen", "other"] as const;
const METHODS = ["cash", "check", "transfer", "card"] as const;
const ERROR_KEYS = new Set(["ERR_studentRequired", "ERR_amountInvalid"]);

const TYPE_STYLES: Record<string, string> = {
  tuition: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  registration: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  transport: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  canteen: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

type FormState =
  | { mode: "collect"; studentId: string; period: string }
  | { mode: "edit"; payment: PaymentRow }
  | null;

export default function PaymentsView({
  payments,
  students,
  classOptions,
  canEdit,
  today,
}: {
  payments: PaymentRow[];
  students: StudentFees[];
  classOptions: ClassOption[];
  canEdit: boolean;
  today: string;
}) {
  const t = useTranslations("payments");
  const tn = useTranslations("nav");
  const tr = useTranslations("receipt");

  const [view, setView] = useState<"months" | "list">("months");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [month, setMonth] = useState(today);
  const [monthFilter, setMonthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [form, setForm] = useState<FormState>(null);

  const q = search.trim().toLowerCase();

  // ---------- Onglet « Mensualités » : situation de chaque élève ----------
  const rows = useMemo(() => {
    return students
      .filter((s) => !classFilter || s.classId === classFilter)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .map((s) => {
        const m = s.account.months.find((x) => x.period === month);
        return { ...s, month: m };
      })
      .sort((a, b) => b.account.remaining - a.account.remaining);
  }, [students, classFilter, q, month]);

  const totals = useMemo(() => {
    let due = 0,
      paid = 0,
      rest = 0,
      arrears = 0;
    for (const r of rows) {
      if (r.month) {
        due += r.month.due;
        paid += Math.min(r.month.paid, r.month.due);
        rest += r.month.remaining;
      }
      arrears += r.account.remaining;
    }
    return { due, paid, rest, arrears };
  }, [rows]);

  // ---------- Onglet « Historique » : tous les versements ----------
  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (classFilter && p.students?.class_id !== classFilter) return false;
      if (typeFilter && p.type !== typeFilter) return false;
      if (monthFilter && p.period !== monthFilter && !p.paid_at.startsWith(monthFilter))
        return false;
      if (!q) return true;
      const name = p.students ? `${p.students.first_name} ${p.students.last_name}` : "";
      return name.toLowerCase().includes(q);
    });
  }, [payments, q, monthFilter, typeFilter, classFilter]);

  const total = useMemo(
    () => filtered.reduce((sum, p) => sum + Number(p.amount), 0),
    [filtered]
  );

  const selectCls =
    "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tn("payments")}</h1>
        {canEdit && (
          <button
            onClick={() => setForm({ mode: "collect", studentId: "", period: month })}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t("collect")}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
          {(
            [
              ["months", CalendarCheck, t("monthsView")],
              ["list", List, t("listView")],
            ] as const
          ).map(([key, Icon, text]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm ${
                view === key
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {text}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchStudent")}
            className="rounded-md border border-slate-300 bg-white py-2 pe-3 ps-9 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className={selectCls}
        >
          <option value="">{t("allClasses")}</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {view === "months" ? (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || today)}
            className={selectCls}
          />
        ) : (
          <>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className={selectCls}
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={selectCls}
            >
              <option value="">{t("allTypes")}</option>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`type_${x}`)}
                </option>
              ))}
            </select>
            <div className="ms-auto flex items-center gap-2 rounded-md bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
              <Banknote className="h-4 w-4" />
              {t("total")} : <span dir="ltr">{formatMoney(total)}</span>
            </div>
          </>
        )}
      </div>

      {view === "months" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
            <Tile label={t("expectedMonth")} value={totals.due} tone="slate" />
            <Tile label={t("collectedMonth")} value={totals.paid} tone="green" />
            <Tile label={t("remainingMonth")} value={totals.rest} tone="amber" />
            <Tile label={t("arrearsTotal")} value={totals.arrears} tone="red" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-4 py-3 text-start font-medium">{t("student")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("class")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("monthlyFee")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("paid")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("remaining")}</th>
                  <th className="px-4 py-3 text-start font-medium" title={t("remainingToDateHint")}>
                    {t("remainingToDate")}
                  </th>
                  <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      {t("empty")}
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() =>
                      canEdit && setForm({ mode: "collect", studentId: r.id, period: month })
                    }
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                      canEdit ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">{r.className ?? "—"}</td>
                    <td className="px-4 py-3" dir="ltr">
                      {r.month ? r.month.due.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      {r.month ? r.month.paid.toLocaleString() : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        r.month && r.month.remaining > 0 ? "text-red-600 dark:text-red-400" : ""
                      }`}
                      dir="ltr"
                    >
                      {r.month ? r.month.remaining.toLocaleString() : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        r.account.remaining > 0 ? "text-red-700 dark:text-red-300" : "text-slate-400"
                      }`}
                      dir="ltr"
                    >
                      {r.account.remaining.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {r.month ? (
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.month.status]}`}
                        >
                          {t(`status_${r.month.status}`)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">{t("notEnrolled")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "list" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3 text-start font-medium">{t("student")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("class")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("amount")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("type")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("period")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("date")}</th>
                <th className="px-4 py-3 text-end font-medium">{tr("short")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => canEdit && setForm({ mode: "edit", payment: p })}
                  className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                    canEdit ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">
                    {p.students ? `${p.students.last_name} ${p.students.first_name}` : "—"}
                  </td>
                  <td className="px-4 py-3">{p.students?.classes?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold" dir="ltr">
                    {Number(p.amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[p.type]}`}
                    >
                      {t(`type_${p.type}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {p.period ?? "—"}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {p.paid_at}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/recu/paiement/${p.id}`}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        title={tr("print")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-600 dark:text-slate-300"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {tr("short")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <PaymentForm
          key={form.mode === "edit" ? form.payment.id : `c-${form.studentId}-${form.period}`}
          state={form}
          students={students}
          classOptions={classOptions}
          today={today}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "green" | "amber" | "red";
}) {
  const tones = {
    slate: "bg-slate-100 dark:bg-slate-800",
    green: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  };
  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-base font-semibold" dir="ltr">
        {formatMoney(value)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Formulaire « Encaisser » / « Modifier ».
//  Après enregistrement : écran de confirmation avec le bouton
//  « Imprimer le bon » (ouvre le reçu et lance l'impression).
// ---------------------------------------------------------------------
function PaymentForm({
  state,
  students,
  classOptions,
  today,
  onClose,
}: {
  state: NonNullable<FormState>;
  students: StudentFees[];
  classOptions: ClassOption[];
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const tr = useTranslations("receipt");
  const router = useRouter();
  const label = useMonthLabel();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const editing = state.mode === "edit" ? state.payment : null;

  const [studentId, setStudentId] = useState(
    editing?.student_id ?? (state.mode === "collect" ? state.studentId : "")
  );
  const student = students.find((s) => s.id === studentId) ?? null;
  // On choisit d'abord la classe (c'est elle qui fixe la mensualité),
  // puis l'élève parmi ceux de cette classe.
  const [classId, setClassId] = useState(student?.classId ?? "");
  const classStudents = students.filter((s) => s.classId === classId);
  const classFee = classStudents[0]?.account.monthlyFee ?? 0;

  // Mois proposé : celui demandé, sinon le plus ancien mois impayé.
  const firstUnpaid = (s: StudentFees | null) =>
    s?.account.months.find((m) => !m.upcoming && m.remaining > 0)?.period;
  const initialPeriod =
    editing?.period ??
    (state.mode === "collect"
      ? student?.account.months.find((m) => m.period === state.period && m.remaining > 0)
          ?.period ??
        firstUnpaid(student) ??
        state.period
      : today);
  const [period, setPeriod] = useState(initialPeriod ?? today);
  const [type, setType] = useState<string>(editing?.type ?? "tuition");
  const remainingFor = (s: StudentFees | null, p: string) =>
    s?.account.months.find((m) => m.period === p)?.remaining ?? 0;
  const [amount, setAmount] = useState<string>(
    editing ? String(editing.amount) : String(remainingFor(student, period) || "")
  );

  function pickStudent(id: string) {
    setStudentId(id);
    const s = students.find((x) => x.id === id) ?? null;
    const p = firstUnpaid(s) ?? today;
    setPeriod(p);
    setAmount(String(remainingFor(s, p) || ""));
  }

  function pickMonth(p: string) {
    setPeriod(p);
    if (type === "tuition") setAmount(String(remainingFor(student, p) || ""));
  }

  function handleSubmit(fd: FormData) {
    setBusy("save");
    setError(null);
    startTransition(async () => {
      const res = await savePayment(fd);
      if (res.error) {
        setError(ERROR_KEYS.has(res.error) ? t(res.error) : res.error);
      } else {
        setSavedId(res.id);
        router.refresh();
      }
    });
  }

  async function handleDelete() {
    if (!editing) return;
    setBusy("delete");
    const ok = await confirmDelete(t("deleteConfirm"), tc("delete"), tc("cancel"));
    if (!ok) return;
    startTransition(async () => {
      await deletePayment(editing.id);
      router.refresh();
      onClose();
    });
  }

  const waiting = (a: string) => pending && busy === a;

  // ---------- Confirmation + impression du bon ----------
  if (savedId) {
    return (
      <Modal title={t("savedTitle")} onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {student?.name}
            <br />
            <span className="font-semibold" dir="ltr">
              {formatMoney(Number(amount))}
            </span>
            {type === "tuition" && period && <> — <span className="capitalize">{label.long(period)}</span></>}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={`/recu/paiement/${savedId}?print=1`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Printer className="h-4 w-4" />
              {t("printSlip")}
            </Link>
            <button
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {tc("close")}
            </button>
          </div>
          <p className="text-xs text-slate-400">{tr("footer")}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={editing ? t("edit") : t("collect")} onClose={onClose}>
      <form action={handleSubmit} className="space-y-3">
        {editing && <input type="hidden" name="id" value={editing.id} />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FloatSelect
            label={t("class")}
            required
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              pickStudent("");
            }}
          >
            <option value="" disabled></option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FloatSelect>
          <FloatSelect
            label={t("student")}
            name="student_id"
            required
            disabled={!classId}
            value={studentId}
            onChange={(e) => pickStudent(e.target.value)}
          >
            <option value="" disabled></option>
            {classStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </FloatSelect>
        </div>

        {classId && !student && (
          <p className="text-xs text-slate-500">
            {t("monthlyFee")} ({t("class").toLowerCase()}) :{" "}
            <b dir="ltr">{formatMoney(classFee)}</b>
          </p>
        )}

        {student && (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs">
              <span>
                {t("monthlyFee")} :{" "}
                <b dir="ltr">{formatMoney(student.account.monthlyFee)}</b>
              </span>
              <span className={student.account.remaining > 0 ? "text-red-600" : "text-green-600"}>
                {t("remainingToDate")} :{" "}
                <b dir="ltr">{formatMoney(student.account.remaining)}</b>
              </span>
            </div>
            <MonthGrid
              months={student.account.months}
              selected={type === "tuition" ? period : undefined}
              onPick={(m) => pickMonth(m.period)}
            />
            <p className="mt-2 text-[11px] text-slate-400">{t("pickMonthHint")}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FloatInput
            label={t("amount")}
            type="number"
            name="amount"
            required
            min={1}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <FloatSelect
            label={t("type")}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`type_${x}`)}
              </option>
            ))}
          </FloatSelect>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FloatSelect label={t("method")} name="method" defaultValue={editing?.method ?? "cash"}>
            {METHODS.map((x) => (
              <option key={x} value={x}>
                {t(`method_${x}`)}
              </option>
            ))}
          </FloatSelect>
          <FloatInput
            label={t("period")}
            type="month"
            name="period"
            value={period}
            onChange={(e) => pickMonth(e.target.value)}
          />
          <FloatInput
            label={t("date")}
            type="date"
            name="paid_at"
            required
            defaultValue={editing?.paid_at ?? new Date().toISOString().slice(0, 10)}
          />
        </div>

        <FloatTextarea label={t("notes")} name="notes" rows={2} defaultValue={editing?.notes ?? ""} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          {editing ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
            >
              <BusyLabel loading={waiting("delete")}>
                <Trash2 className="h-4 w-4" />
                {tc("delete")}
              </BusyLabel>
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <BusyLabel loading={waiting("save")}>
                {editing ? tc("save") : t("saveAndPrint")}
              </BusyLabel>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
