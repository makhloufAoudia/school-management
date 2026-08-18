"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Trash2, History } from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { saveClass, deleteClass } from "@/lib/actions/classes";
import { CURRENCY, formatMoney } from "@/lib/format";

export type ClassRow = {
  id: string;
  name: string;
  level: string;
  capacity: number;
  monthly_fee: number;
  extra_fee: number;
  academic_year_id: string;
  head_teacher_id: string | null;
  students: { count: number }[];
};

export type TeacherOption = { id: string; name: string };

export type FeeHistoryRow = {
  id: string;
  class_id: string;
  old_fee: number | null;
  new_fee: number;
  changed_at: string;
};

// Clés d'erreur renvoyées par le serveur -> clé de traduction.
const ERROR_KEYS = new Set([
  "ERR_nameRequired",
  "ERR_levelRequired",
  "ERR_feeRequired",
  "ERR_feeInvalid",
]);

export default function ClassesView({
  classes,
  feeHistory = [],
  yearId,
  yearLabel,
  teacherOptions = [],
  canEdit,
}: {
  classes: ClassRow[];
  feeHistory?: FeeHistoryRow[];
  yearId: string | null;
  yearLabel: string;
  // Enseignants proposés comme professeur principal.
  teacherOptions?: TeacherOption[];
  canEdit: boolean;
}) {
  const t = useTranslations("classes");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Quel bouton a lancé l'action : lui seul affiche « Veuillez patienter ».
  const [busy, setBusy] = useState("");
  const waiting = (action: string) => pending && busy === action;

  // Nom du professeur principal, pour l'affichage du tableau.
  const teacherName = (id: string | null) =>
    id ? (teacherOptions.find((x) => x.id === id)?.name ?? null) : null;

  // Historique du tarif de la classe en cours d'édition (le plus récent d'abord).
  const editingHistory = useMemo(
    () =>
      editing
        ? feeHistory.filter((h) => h.class_id === editing.id)
        : [],
    [editing, feeHistory]
  );

  function openAdd() {
    setEditing(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(c: ClassRow) {
    setEditing(c);
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    setBusy("save");
    startTransition(async () => {
      const res = await saveClass(formData);
      if (res.error) {
        setError(ERROR_KEYS.has(res.error) ? t(res.error) : res.error);
      } else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    setBusy("delete");
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      await deleteClass(id);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tn("classes")}</h1>
          <p className="text-sm text-slate-500">{yearLabel}</p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("level")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("headTeacher")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("students")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("capacity")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("monthlyFee")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("extraFee")}</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {classes.map((c) => {
              const count = c.students?.[0]?.count ?? 0;
              return (
                <tr
                  key={c.id}
                  onClick={() => canEdit && openEdit(c)}
                  className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                    canEdit
                      ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.level}</td>
                  <td className="px-4 py-3">
                    {teacherName(c.head_teacher_id) ?? (
                      <span className="text-slate-400">{t("noHeadTeacher")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        count >= c.capacity ? "font-semibold text-red-600" : ""
                      }
                    >
                      {count} / {c.capacity}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c.capacity}</td>
                  <td className="px-4 py-3" dir="ltr">{formatMoney(c.monthly_fee)}</td>
                  <td className="px-4 py-3" dir="ltr">{formatMoney(c.extra_fee)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editing ? t("edit") : t("add")}
          onClose={() => setShowForm(false)}
        >
          <form action={handleSubmit} className="space-y-3">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input
              type="hidden"
              name="academic_year_id"
              value={editing?.academic_year_id ?? yearId ?? ""}
            />

            <FloatInput
              label={t("name")}
              name="name"
              required
              defaultValue={editing?.name ?? ""}
            />

            <FloatInput
              label={t("level")}
              name="level"
              required
              defaultValue={editing?.level ?? ""}
            />

            <FloatSelect
              label={t("headTeacher")}
              name="head_teacher_id"
              defaultValue={editing?.head_teacher_id ?? ""}
            >
              <option value="">{t("noHeadTeacher")}</option>
              {teacherOptions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </FloatSelect>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FloatInput
                label={t("capacity")}
                type="number"
                name="capacity"
                min={1}
                defaultValue={editing?.capacity ?? 30}
              />
              <FloatInput
                label={`${t("monthlyFee")} (${CURRENCY})`}
                type="number"
                name="monthly_fee"
                required
                min={1}
                step="0.01"
                defaultValue={editing?.monthly_fee || ""}
              />
            </div>

            <FloatInput
              label={`${t("extraFee")} (${CURRENCY})`}
              type="number"
              name="extra_fee"
              min={0}
              step="0.01"
              defaultValue={editing?.extra_fee ?? 0}
            />

            {editing && editingHistory.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <History className="h-3.5 w-3.5" />
                  {t("feeHistory")}
                </div>
                <ul className="space-y-1 text-xs">
                  {editingHistory.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300"
                    >
                      <span dir="ltr">
                        {formatMoney(h.old_fee ?? 0)} → {formatMoney(h.new_fee)}
                      </span>
                      <span className="text-slate-400" dir="ltr">
                        {new Date(h.changed_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
