"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, Trash2, Search } from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect, FloatTextarea } from "@/components/ui/fields";
import { saveStudent, deleteStudent } from "@/lib/actions/students";

export type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  gender: "M" | "F" | null;
  birth_date: string | null;
  class_id: string | null;
  enrollment_date: string;
  status: "active" | "suspended" | "left";
  notes: string | null;
  classes: { name: string } | null;
};

export type ClassOption = { id: string; name: string };

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  suspended: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  left: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export default function StudentsView({
  students,
  classOptions,
  canEdit,
  defaultClassId = "",
}: {
  students: StudentRow[];
  classOptions: ClassOption[];
  canEdit: boolean;
  defaultClassId?: string;
}) {
  const t = useTranslations("students");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(defaultClassId);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter && s.class_id !== classFilter) return false;
      if (!q) return true;
      return `${s.first_name} ${s.last_name}`.toLowerCase().includes(q);
    });
  }, [students, search, classFilter]);

  function openAdd() {
    setEditing(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(s: StudentRow) {
    setEditing(s);
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await saveStudent(formData);
      if (res.error) {
        setError(res.error);
      } else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      await deleteStudent(id);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {tn("students")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({filtered.length})
          </span>
        </h1>
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

      <div className="mb-4 flex flex-wrap gap-3">
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
          <option value="">{t("allClasses")}</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3 text-start font-medium">{t("lastName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("firstName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("class")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("birthDate")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => canEdit && openEdit(s)}
                className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                  canEdit
                    ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    : ""
                }`}
              >
                <td className="px-4 py-3 font-medium">{s.last_name}</td>
                <td className="px-4 py-3">{s.first_name}</td>
                <td className="px-4 py-3">
                  {s.classes?.name ?? (
                    <span className="text-slate-400">{t("noClass")}</span>
                  )}
                </td>
                <td className="px-4 py-3">{s.birth_date ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[s.status]}`}
                  >
                    {t(s.status)}
                  </span>
                </td>
              </tr>
            ))}
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

            <div className="grid grid-cols-2 gap-3">
              <FloatInput
                label={t("lastName")}
                name="last_name"
                required
                defaultValue={editing?.last_name ?? ""}
              />
              <FloatInput
                label={t("firstName")}
                name="first_name"
                required
                defaultValue={editing?.first_name ?? ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FloatSelect
                label={t("gender")}
                name="gender"
                defaultValue={editing?.gender ?? ""}
              >
                <option value=""></option>
                <option value="M">{t("male")}</option>
                <option value="F">{t("female")}</option>
              </FloatSelect>
              <FloatInput
                label={t("birthDate")}
                type="date"
                name="birth_date"
                defaultValue={editing?.birth_date ?? ""}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FloatSelect
                label={t("class")}
                name="class_id"
                defaultValue={editing?.class_id ?? ""}
              >
                <option value="">{t("noClass")}</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </FloatSelect>
              <FloatSelect
                label={t("status")}
                name="status"
                defaultValue={editing?.status ?? "active"}
              >
                <option value="active">{t("active")}</option>
                <option value="suspended">{t("suspended")}</option>
                <option value="left">{t("left")}</option>
              </FloatSelect>
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
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                  {tc("delete")}
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
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {pending ? tc("loading") : tc("save")}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
