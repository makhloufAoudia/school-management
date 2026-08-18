"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { alertError, confirmDelete } from "@/lib/swal";
import { formatMoney } from "@/lib/format";
import { saveSalary, deleteSalary } from "@/lib/actions/salaries";

export type SalaryRow = {
  id: string;
  teacher_id: string;
  amount: number;
  period: string;
  method: string;
  paid_at: string;
  notes: string | null;
  teachers?: { first_name: string; last_name: string } | null;
};

export type TeacherOption = { id: string; name: string };

const METHODS = ["cash", "check", "transfer", "card"] as const;

export default function SalariesView({
  salaries,
  teacherOptions,
}: {
  salaries: SalaryRow[];
  teacherOptions: TeacherOption[];
}) {
  const t = useTranslations("salaries");
  const tp = useTranslations("payments");
  const tc = useTranslations("common");
  const router = useRouter();

  const [monthFilter, setMonthFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [editing, setEditing] = useState<SalaryRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      salaries.filter((s) => {
        if (teacherFilter && s.teacher_id !== teacherFilter) return false;
        if (monthFilter && s.period !== monthFilter) return false;
        return true;
      }),
    [salaries, monthFilter, teacherFilter]
  );

  const total = useMemo(
    () => filtered.reduce((sum, s) => sum + Number(s.amount), 0),
    [filtered]
  );

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(s: SalaryRow) {
    setEditing(s);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    setBusy("save");
    startTransition(async () => {
      const res = await saveSalary(formData);
      setBusy("");
      if (res.error) {
        alertError(res.error === "ERR_unauthorized" ? t("unauthorized") : res.error);
        return;
      }
      setShowForm(false);
      setEditing(null);
      router.refresh();
    });
  }

  async function handleDelete(id: string) {
    const ok = await confirmDelete(t("deleteConfirm"), tc("delete"), tc("cancel"));
    if (!ok) return;
    setBusy(id);
    startTransition(async () => {
      const res = await deleteSalary(id);
      setBusy("");
      if (res.error) alertError(res.error);
      else router.refresh();
    });
  }

  const teacherName = (s: SalaryRow) =>
    s.teachers ? `${s.teachers.last_name} ${s.teachers.first_name}` : "—";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {t("title")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({filtered.length})
          </span>
        </h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {t("add")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
        >
          <option value="">{t("allTeachers")}</option>
          {teacherOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
        />
        <span className="ms-auto text-sm font-medium">
          {tp("total")} : {formatMoney(total)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{t("teacher")}</th>
              <th className="px-4 py-3 text-start font-medium">{tp("amount")}</th>
              <th className="px-4 py-3 text-start font-medium">{tp("period")}</th>
              <th className="px-4 py-3 text-start font-medium">{tp("method")}</th>
              <th className="px-4 py-3 text-start font-medium">{tp("date")}</th>
              <th className="px-4 py-3 text-end font-medium">{tc("actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{teacherName(s)}</td>
                <td className="px-4 py-3 font-medium">{formatMoney(s.amount)}</td>
                <td className="px-4 py-3">{s.period}</td>
                <td className="px-4 py-3">{tp(`method_${s.method}`)}</td>
                <td className="px-4 py-3">{s.paid_at}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/recu/salaire/${s.id}`}
                      target="_blank"
                      title={t("print")}
                      className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    >
                      <Printer className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => openEdit(s)}
                      title={tc("edit")}
                      className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={pending && busy === s.id}
                      title={tc("delete")}
                      className="inline-flex items-center gap-2 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                    >
                      <BusyLabel loading={pending && busy === s.id} size="sm" iconOnly>
                        <Trash2 className="h-4 w-4" />
                      </BusyLabel>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? t("edit") : t("add")}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <form action={handleSubmit} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <FloatSelect
              label={t("teacher")}
              name="teacher_id"
              required
              defaultValue={editing?.teacher_id ?? ""}
            >
              <option value="" disabled />
              {teacherOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </FloatSelect>
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatInput
                label={tp("amount")}
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={editing?.amount ?? ""}
              />
              <FloatInput
                label={tp("period")}
                name="period"
                type="month"
                required
                defaultValue={editing?.period ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatSelect
                label={tp("method")}
                name="method"
                defaultValue={editing?.method ?? "transfer"}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {tp(`method_${m}`)}
                  </option>
                ))}
              </FloatSelect>
              <FloatInput
                label={tp("date")}
                name="paid_at"
                type="date"
                required
                defaultValue={editing?.paid_at ?? new Date().toISOString().slice(0, 10)}
              />
            </div>
            <FloatInput
              label={tp("notes")}
              name="notes"
              defaultValue={editing?.notes ?? ""}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending && busy === "save"}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <BusyLabel loading={pending && busy === "save"}>{tc("save")}</BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
