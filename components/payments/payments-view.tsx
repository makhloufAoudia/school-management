"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Plus,
  Trash2,
  Search,
  Banknote,
  List,
  AlertCircle,
  CalendarPlus,
  Lock,
} from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect, FloatTextarea } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { confirmDelete, alertError } from "@/lib/swal";
import {
  savePayment,
  deletePayment,
  saveClassDue,
  deleteClassDue,
  generateMonthlyDues,
} from "@/lib/actions/payments";
import { saveClassExtraFee } from "@/lib/actions/classes";
import { formatMoney } from "@/lib/format";

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

export type StudentOption = {
  id: string;
  classId: string | null;
  name: string;
  className: string | null;
  monthlyFee: number;
  extraFee: number;
};

export type ClassDue = {
  id: string;
  class_id: string;
  label: string;
  amount: number;
  period: string;
  classes: { name: string } | null;
};

export type ClassOption = { id: string; name: string; extra_fee: number };

// Échéance mensuelle générée (tarif figé pour un élève sur une période).
export type GeneratedDue = {
  student_id: string;
  period: string;
  amount: number;
};

type Prefill = {
  student_id?: string;
  amount?: number;
  period?: string;
} | null;

const TYPES = ["tuition", "registration", "transport", "canteen", "other"] as const;
const METHODS = ["cash", "check", "transfer", "card"] as const;

// Clés d'erreur serveur -> clé de traduction.
const ERROR_KEYS = new Set(["ERR_periodRequired"]);

const TYPE_STYLES: Record<string, string> = {
  tuition: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  registration: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  transport: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  canteen: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function PaymentsView({
  payments,
  studentOptions,
  classDues,
  classOptions,
  generatedDues = [],
  canEdit,
  defaultClassId = "",
}: {
  payments: PaymentRow[];
  studentOptions: StudentOption[];
  classDues: ClassDue[];
  classOptions: ClassOption[];
  generatedDues?: GeneratedDue[];
  canEdit: boolean;
  defaultClassId?: string;
}) {
  const t = useTranslations("payments");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [view, setView] = useState<"list" | "dues">("list");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [duesMonth, setDuesMonth] = useState(currentMonth);
  const [typeFilter, setTypeFilter] = useState("");
  const [classFilter, setClassFilter] = useState(defaultClassId);
  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [prefill, setPrefill] = useState<Prefill>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDueForm, setShowDueForm] = useState(false);
  const [showFeesForm, setShowFeesForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Quel bouton a lancé l'action : lui seul affiche « Veuillez patienter ».
  const [busy, setBusy] = useState("");
  const waiting = (action: string) => pending && busy === action;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (classFilter && p.students?.class_id !== classFilter) return false;
      if (typeFilter && p.type !== typeFilter) return false;
      if (monthFilter && p.period !== monthFilter && !p.paid_at.startsWith(monthFilter))
        return false;
      if (!q) return true;
      const name = p.students
        ? `${p.students.first_name} ${p.students.last_name}`
        : "";
      return name.toLowerCase().includes(q);
    });
  }, [payments, search, monthFilter, typeFilter, classFilter]);

  const total = useMemo(
    () => filtered.reduce((sum, p) => sum + Number(p.amount), 0),
    [filtered]
  );

  // ---------- Dûs du mois : frais de classe + dûs appliqués à la classe ----------
  const monthDues = useMemo(
    () => classDues.filter((d) => d.period === duesMonth),
    [classDues, duesMonth]
  );

  // Échéances figées pour le mois affiché : student_id -> montant mensuel figé.
  const frozenByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of generatedDues) {
      if (g.period === duesMonth) m.set(g.student_id, Number(g.amount));
    }
    return m;
  }, [generatedDues, duesMonth]);

  const dues = useMemo(() => {
    const paidByStudent = new Map<string, number>();
    for (const p of payments) {
      if (p.period !== duesMonth) continue;
      paidByStudent.set(
        p.student_id,
        (paidByStudent.get(p.student_id) ?? 0) + Number(p.amount)
      );
    }
    const extraByClass = new Map<string, number>();
    for (const d of monthDues) {
      extraByClass.set(
        d.class_id,
        (extraByClass.get(d.class_id) ?? 0) + Number(d.amount)
      );
    }
    const q = search.trim().toLowerCase();
    return studentOptions
      .map((s) => {
        const duesExtra = s.classId ? (extraByClass.get(s.classId) ?? 0) : 0;
        // Si une échéance a été générée pour ce mois, on utilise le montant figé
        // (le tarif de la classe a pu changer depuis) ; sinon le tarif courant.
        const frozen = frozenByStudent.get(s.id);
        const isFrozen = frozen !== undefined;
        const monthlyFee = isFrozen ? frozen : s.monthlyFee;
        const expected = monthlyFee + s.extraFee + duesExtra;
        const paid = paidByStudent.get(s.id) ?? 0;
        const remaining = Math.max(0, expected - paid);
        return {
          ...s,
          monthlyFee,
          isFrozen,
          expected,
          duesExtra,
          paid,
          remaining,
          status:
            remaining <= 0 ? "paid" : paid > 0 ? "partial" : ("unpaid" as const),
        };
      })
      .filter((s) => s.expected > 0)
      .filter((s) => !classFilter || s.classId === classFilter)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => b.remaining - a.remaining);
  }, [payments, studentOptions, monthDues, duesMonth, search, classFilter, frozenByStudent]);

  // Nombre d'élèves du mois affiché n'ayant pas encore d'échéance générée.
  const ungeneratedCount = useMemo(
    () => dues.filter((d) => !d.isFrozen && d.monthlyFee > 0).length,
    [dues]
  );

  function handleGenerateDues() {
    setBusy("generate");
    startTransition(async () => {
      const res = await generateMonthlyDues(duesMonth);
      if (res.error) {
        alertError(
          ERROR_KEYS.has(res.error) ? t(res.error) : res.error
        );
      } else {
        router.refresh();
      }
    });
  }

  const duesTotals = useMemo(
    () => ({
      expected: dues.reduce((s, d) => s + d.expected, 0),
      collected: dues.reduce((s, d) => s + d.paid, 0),
      outstanding: dues.reduce((s, d) => s + d.remaining, 0),
    }),
    [dues]
  );

  function handleSaveFees(formData: FormData) {
    setBusy("fees");
    startTransition(async () => {
      for (const c of classOptions) {
        const raw = formData.get(`fee_${c.id}`);
        const value = Number(raw ?? 0);
        if (value !== Number(c.extra_fee)) {
          await saveClassExtraFee(c.id, value);
        }
      }
      setShowFeesForm(false);
      router.refresh();
    });
  }

  async function handleDeleteDue(id: string) {
    setBusy("deleteDue-" + id);
    const ok = await confirmDelete(t("deleteDueConfirm"), tc("delete"), tc("cancel"));
    if (!ok) return;
    startTransition(async () => {
      await deleteClassDue(id);
      router.refresh();
    });
  }

  function openAdd(withPrefill: Prefill = null) {
    setEditing(null);
    setPrefill(withPrefill);
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: PaymentRow) {
    if (!canEdit) return;
    setEditing(p);
    setPrefill(null);
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    setBusy("save");
    startTransition(async () => {
      const res = await savePayment(formData);
      if (res.error) {
        setError(res.error);
      } else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  async function handleDelete(id: string) {
    setBusy("delete");
    const ok = await confirmDelete(t("deleteConfirm"), tc("delete"), tc("cancel"));
    if (!ok) return;
    startTransition(async () => {
      await deletePayment(id);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {tn("payments")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({filtered.length})
          </span>
        </h1>
        {canEdit && (
          <button
            onClick={() => openAdd()}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm ${
              view === "list"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <List className="h-4 w-4" />
            {t("listView")}
          </button>
          <button
            onClick={() => setView("dues")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm ${
              view === "dues"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <AlertCircle className="h-4 w-4" />
            {t("duesView")}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc("search")}
            className="rounded-md border border-slate-300 bg-white py-2 pe-3 ps-9 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="">{t("allClassesDue")}</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {view === "list" ? (
          <>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
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
              {t("total")} : {total.toLocaleString()}
            </div>
          </>
        ) : (
          <>
            <input
              type="month"
              value={duesMonth}
              onChange={(e) => setDuesMonth(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
            />
            {canEdit && (
              <>
                <button
                  onClick={() => setShowFeesForm(true)}
                  className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Banknote className="h-4 w-4" />
                  {t("fixedFees")}
                </button>
                <button
                  onClick={() => setShowDueForm(true)}
                  className="flex items-center gap-2 rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950"
                >
                  <Plus className="h-4 w-4" />
                  {t("applyDue")}
                </button>
                <button
                  onClick={handleGenerateDues}
                  disabled={pending || ungeneratedCount === 0}
                  title={t("generateDuesHint")}
                  className="flex items-center gap-2 rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                >
                  <BusyLabel loading={waiting("generate")}>
                    <CalendarPlus className="h-4 w-4" />
                    {t("generateDues")}
                    {ungeneratedCount > 0 && (
                      <span className="rounded-full bg-emerald-100 px-1.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        {ungeneratedCount}
                      </span>
                    )}
                  </BusyLabel>
                </button>
              </>
            )}
            <div className="ms-auto flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md bg-slate-100 px-3 py-2 font-medium dark:bg-slate-800">
                {t("expected")} : {duesTotals.expected.toLocaleString()}
              </span>
              <span className="rounded-md bg-green-50 px-3 py-2 font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                {t("collected")} : {duesTotals.collected.toLocaleString()}
              </span>
              <span className="rounded-md bg-red-50 px-3 py-2 font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                {t("outstanding")} : {duesTotals.outstanding.toLocaleString()}
              </span>
            </div>
          </>
        )}
      </div>

      {view === "dues" && monthDues.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {monthDues.map((d) => (
            <span
              key={d.id}
              className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 py-1 pe-1 ps-3 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
            >
              {d.label} · {d.classes?.name ?? "?"} ·{" "}
              <span dir="ltr">{Number(d.amount).toLocaleString()}</span>
              {canEdit && (
                <button
                  onClick={() => handleDeleteDue(d.id)}
                  disabled={waiting("deleteDue-" + d.id)}
                  className="inline-flex items-center gap-1 rounded-full p-0.5 hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed dark:hover:bg-red-950"
                >
                  <BusyLabel loading={waiting("deleteDue-" + d.id)} size="sm">
                    <Trash2 className="h-3.5 w-3.5" />
                  </BusyLabel>
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {view === "dues" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3 text-start font-medium">{t("student")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("due")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("paid")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("remaining")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {dues.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {dues.map((d) => (
                <tr
                  key={d.id}
                  onClick={() =>
                    canEdit &&
                    d.remaining > 0 &&
                    openAdd({
                      student_id: d.id,
                      amount: d.remaining,
                      period: duesMonth,
                    })
                  }
                  className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                    canEdit && d.remaining > 0
                      ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {d.name}
                      {d.isFrozen && (
                        <Lock
                          className="h-3 w-3 text-emerald-500"
                          aria-label={t("dueFrozen")}
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    <div>{formatMoney(d.expected)}</div>
                    {(d.extraFee > 0 || d.duesExtra > 0) && (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {t("feeMonthly")} {d.monthlyFee.toLocaleString()}
                        {d.extraFee > 0 &&
                          ` + ${t("feeFixed")} ${d.extraFee.toLocaleString()}`}
                        {d.duesExtra > 0 &&
                          ` + ${t("feeDues")} ${d.duesExtra.toLocaleString()}`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" dir="ltr">
                    {d.paid.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      d.remaining > 0 ? "text-red-600 dark:text-red-400" : ""
                    }`}
                    dir="ltr"
                  >
                    {d.remaining.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        d.status === "paid"
                          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : d.status === "partial"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {t(`status_${d.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr
                key={p.id}
                onClick={() => openEdit(p)}
                className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                  canEdit
                    ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    : ""
                }`}
              >
                <td className="px-4 py-3 font-medium">
                  {p.students
                    ? `${p.students.last_name} ${p.students.first_name}`
                    : "—"}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {showFeesForm && (
        <Modal title={t("fixedFees")} onClose={() => setShowFeesForm(false)}>
          <form action={handleSaveFees} className="space-y-3">
            <p className="text-sm text-slate-500">{t("fixedFeesHint")}</p>
            <div className="max-h-80 space-y-3 overflow-y-auto pe-1">
              {classOptions.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">
                  {t("empty")}
                </p>
              )}
              {classOptions.map((c) => (
                <FloatInput
                  key={c.id}
                  label={c.name}
                  type="number"
                  name={`fee_${c.id}`}
                  min={0}
                  step="0.01"
                  defaultValue={Number(c.extra_fee)}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowFeesForm(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={waiting("fees")}>{tc("save")}</BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showDueForm && (
        <Modal title={t("applyDue")} onClose={() => setShowDueForm(false)}>
          <form
            action={(fd) => {
              setBusy("due");
              startTransition(async () => {
                const res = await saveClassDue(fd);
                if (!res.error) {
                  setShowDueForm(false);
                  router.refresh();
                }
              });
            }}
            className="space-y-3"
          >
            <FloatSelect label={t("class")} name="class_id" required defaultValue="">
              <option value="" disabled></option>
              <option value="all">{t("allClassesDue")}</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FloatSelect>

            <FloatInput label={t("dueLabel")} name="label" required />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FloatInput
                label={t("amount")}
                type="number"
                name="amount"
                required
                min={0}
                step="0.01"
              />
              <FloatInput
                label={t("period")}
                type="month"
                name="period"
                required
                defaultValue={duesMonth}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDueForm(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={waiting("due")}>{tc("save")}</BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showForm && (
        <Modal
          title={editing ? t("edit") : t("add")}
          onClose={() => setShowForm(false)}
        >
          <form action={handleSubmit} className="space-y-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}

            <FloatSelect
              label={t("student")}
              name="student_id"
              required
              defaultValue={editing?.student_id ?? prefill?.student_id ?? ""}
            >
              <option value="" disabled></option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </FloatSelect>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FloatInput
                label={t("amount")}
                type="number"
                name="amount"
                required
                min={0}
                step="0.01"
                defaultValue={editing?.amount ?? prefill?.amount ?? ""}
              />
              <FloatSelect
                label={t("type")}
                name="type"
                defaultValue={editing?.type ?? "tuition"}
              >
                {TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`type_${x}`)}
                  </option>
                ))}
              </FloatSelect>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FloatSelect
                label={t("method")}
                name="method"
                defaultValue={editing?.method ?? "cash"}
              >
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
                defaultValue={editing?.period ?? prefill?.period ?? currentMonth}
              />
              <FloatInput
                label={t("date")}
                type="date"
                name="paid_at"
                required
                defaultValue={editing?.paid_at ?? new Date().toISOString().slice(0, 10)}
              />
            </div>

            <FloatTextarea
              label={t("notes")}
              name="notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center justify-between pt-2">
              {editing ? (
                <button
                  type="button"
                  onClick={() => handleDelete(editing.id)}
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
                  onClick={() => setShowForm(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {tc("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BusyLabel loading={waiting("save")}>{tc("save")}</BusyLabel>
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
