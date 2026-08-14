"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Plus,
  Trash2,
  Check,
  KeyRound,
  Star,
  Search,
  GripVertical,
} from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput } from "@/components/ui/fields";
import { createClient } from "@/lib/supabase/client";
import { alertError, confirmDelete } from "@/lib/swal";
import {
  saveYear,
  setCurrentYear,
  deleteYear,
  updateYearsOrder,
  saveSubject,
  deleteSubject,
  updateProfileName,
  updateSchool,
} from "@/lib/actions/settings";

function isValidYear(label: string, start: string, end: string): boolean {
  const m = label.trim().match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!m) return false;
  const y1 = Number(m[1]);
  const y2 = Number(m[2]);
  if (y2 !== y1 + 1) return false;
  if (!start || !end || end <= start) return false;
  const startYear = new Date(start).getFullYear();
  const endYear = new Date(end).getFullYear();
  return startYear === y1 && endYear === y2;
}

export type YearRow = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
};

export type SubjectRow = { id: string; name: string };

export type SchoolRow = { id: string; name: string; slug: string };

const card =
  "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const btnPrimary =
  "flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
const btnSecondary =
  "rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800";
const btnDelete =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950";

export default function SettingsView({
  years,
  subjects,
  school = null,
  fullName,
  isAdmin,
}: {
  years: YearRow[];
  subjects: SubjectRow[];
  school?: SchoolRow | null;
  fullName: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("settings");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Profil
  const [pwd, setPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<"ok" | "error" | null>(null);
  const [nameMsg, setNameMsg] = useState(false);
  const [schoolMsg, setSchoolMsg] = useState(false);

  // Années : ordre local pour le glisser-déposer
  const [orderedYears, setOrderedYears] = useState<YearRow[]>(years);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setOrderedYears(years);
  }, [years]);

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...orderedYears];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setOrderedYears(next);
    setDragIndex(null);
    startTransition(async () => {
      await updateYearsOrder(next.map((y) => y.id));
      refresh();
    });
  }

  // Matières
  const [subjectSearch, setSubjectSearch] = useState("");
  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(subjectSearch.trim().toLowerCase())
  );

  // Modals
  const [yearModal, setYearModal] = useState<"closed" | "new" | YearRow>(
    "closed"
  );
  const [subjectModal, setSubjectModal] = useState<
    "closed" | "new" | SubjectRow
  >("closed");

  const editingYear = yearModal !== "closed" && yearModal !== "new" ? yearModal : null;
  const editingSubject =
    subjectModal !== "closed" && subjectModal !== "new" ? subjectModal : null;

  function refresh() {
    router.refresh();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setPwdMsg(error ? "error" : "ok");
    if (!error) setPwd("");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{tn("settings")}</h1>

      {/* ---------- Profil ---------- */}
      <section className={card}>
        <h2 className="mb-4 font-semibold">{t("profile")}</h2>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateProfileName(fd);
              setNameMsg(true);
              refresh();
            })
          }
          className="flex items-end gap-3"
        >
          <div className="flex-1">
            <FloatInput
              label={t("fullName")}
              name="full_name"
              required
              defaultValue={fullName}
              onChange={() => setNameMsg(false)}
            />
          </div>
          <button type="submit" disabled={pending} className={btnPrimary}>
            {tc("save")}
          </button>
        </form>
        {nameMsg && (
          <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" /> {t("saved")}
          </p>
        )}

        <form onSubmit={changePassword} className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <FloatInput
              label={t("newPassword")}
              type="password"
              required
              minLength={6}
              value={pwd}
              onChange={(e) => {
                setPwd(e.target.value);
                setPwdMsg(null);
              }}
            />
          </div>
          <button type="submit" className={btnPrimary}>
            <KeyRound className="h-4 w-4" />
            {t("changePassword")}
          </button>
        </form>
        {pwdMsg === "ok" && (
          <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
            <Check className="h-4 w-4" /> {t("saved")}
          </p>
        )}
        {pwdMsg === "error" && (
          <p className="mt-2 text-sm text-red-600">{t("passwordError")}</p>
        )}
      </section>

      {isAdmin && school && (
        /* ---------- École ---------- */
        <section className={card}>
          <h2 className="mb-4 font-semibold">{t("school")}</h2>
          <form
            action={(fd) =>
              startTransition(async () => {
                const res = await updateSchool(fd);
                if (res?.error) {
                  alertError(t("saveError"));
                } else {
                  setSchoolMsg(true);
                  refresh();
                }
              })
            }
            className="flex items-end gap-3"
          >
            <input type="hidden" name="id" value={school.id} />
            <div className="flex-1">
              <FloatInput
                label={t("schoolName")}
                name="name"
                required
                defaultValue={school.name}
                onChange={() => setSchoolMsg(false)}
              />
            </div>
            <button type="submit" disabled={pending} className={btnPrimary}>
              {tc("save")}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            {t("schoolSlug")} : <span dir="ltr">{school.slug}</span>
          </p>
          {schoolMsg && (
            <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" /> {t("saved")}
            </p>
          )}
        </section>
      )}

      {isAdmin && (
        <>
          {/* ---------- Années scolaires ---------- */}
          <section className={card}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{t("years")}</h2>
              <button onClick={() => setYearModal("new")} className={btnPrimary}>
                <Plus className="h-4 w-4" />
                {tc("add")}
              </button>
            </div>
            <ul className="space-y-2">
              {orderedYears.map((y, i) => (
                <li
                  key={y.id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => setDragIndex(null)}
                  onClick={() => setYearModal(y)}
                  className={`flex cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50 ${
                    dragIndex === i ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 cursor-grab text-slate-300 dark:text-slate-600" />
                    <span className="font-medium">{y.label}</span>
                    <span className="text-xs text-slate-400" dir="ltr">
                      {y.start_date} → {y.end_date}
                    </span>
                  </div>
                  {y.is_current && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {t("current")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ---------- Matières ---------- */}
          <section className={card}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{t("subjects")}</h2>
              <button
                onClick={() => setSubjectModal("new")}
                className={btnPrimary}
              >
                <Plus className="h-4 w-4" />
                {tc("add")}
              </button>
            </div>
            <div className="relative mb-4 w-fit">
              <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder={tc("search")}
                className="rounded-md border border-slate-300 bg-white py-2 pe-3 ps-9 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredSubjects.length === 0 && (
                <p className="text-sm text-slate-400">{t("noSubjects")}</p>
              )}
              {filteredSubjects.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSubjectModal(s)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ---------- Modal année ---------- */}
      {yearModal !== "closed" && (
        <Modal
          title={editingYear ? tc("edit") : tc("add")}
          onClose={() => setYearModal("closed")}
        >
          <form
            action={(fd) => {
              const label = fd.get("label") as string;
              const start = fd.get("start_date") as string;
              const end = fd.get("end_date") as string;
              if (!isValidYear(label, start, end)) {
                alertError(t("invalidYear"), t("invalidYearHint"));
                return;
              }
              startTransition(async () => {
                await saveYear(fd);
                setYearModal("closed");
                refresh();
              });
            }}
            className="space-y-3"
          >
            {editingYear && (
              <input type="hidden" name="id" value={editingYear.id} />
            )}
            <FloatInput
              label={t("yearLabel")}
              name="label"
              required
              defaultValue={editingYear?.label ?? ""}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FloatInput
                label={t("startDate")}
                type="date"
                name="start_date"
                required
                defaultValue={editingYear?.start_date ?? ""}
              />
              <FloatInput
                label={t("endDate")}
                type="date"
                name="end_date"
                required
                defaultValue={editingYear?.end_date ?? ""}
              />
            </div>

            {editingYear && !editingYear.is_current && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await setCurrentYear(editingYear.id);
                    setYearModal("closed");
                    refresh();
                  })
                }
                className="flex items-center gap-2 rounded-md border border-indigo-200 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-950"
              >
                <Star className="h-4 w-4" />
                {t("setCurrent")}
              </button>
            )}

            <div className="flex items-center justify-between pt-2">
              {editingYear ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    const ok = await confirmDelete(
                      t("deleteYearConfirm"),
                      tc("delete"),
                      tc("cancel")
                    );
                    if (!ok) return;
                    startTransition(async () => {
                      await deleteYear(editingYear.id);
                      setYearModal("closed");
                      refresh();
                    });
                  }}
                  className={btnDelete}
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
                  onClick={() => setYearModal("closed")}
                  className={btnSecondary}
                >
                  {tc("cancel")}
                </button>
                <button type="submit" disabled={pending} className={btnPrimary}>
                  {pending ? tc("loading") : tc("save")}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- Modal matière ---------- */}
      {subjectModal !== "closed" && (
        <Modal
          title={editingSubject ? tc("edit") : tc("add")}
          onClose={() => setSubjectModal("closed")}
        >
          <form
            action={(fd) =>
              startTransition(async () => {
                await saveSubject(fd);
                setSubjectModal("closed");
                refresh();
              })
            }
            className="space-y-3"
          >
            {editingSubject && (
              <input type="hidden" name="id" value={editingSubject.id} />
            )}
            <FloatInput
              label={t("subjectName")}
              name="name"
              required
              defaultValue={editingSubject?.name ?? ""}
            />

            <div className="flex items-center justify-between pt-2">
              {editingSubject ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    const ok = await confirmDelete(
                      t("deleteSubjectConfirm"),
                      tc("delete"),
                      tc("cancel")
                    );
                    if (!ok) return;
                    startTransition(async () => {
                      await deleteSubject(editingSubject.id);
                      setSubjectModal("closed");
                      refresh();
                    });
                  }}
                  className={btnDelete}
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
                  onClick={() => setSubjectModal("closed")}
                  className={btnSecondary}
                >
                  {tc("cancel")}
                </button>
                <button type="submit" disabled={pending} className={btnPrimary}>
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
