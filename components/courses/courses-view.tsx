"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Plus,
  Trash2,
  FileText,
  Upload,
  Eye,
  Download,
  Archive,
  List,
  CalendarDays,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect } from "@/components/ui/fields";
import { alertError, confirmDelete } from "@/lib/swal";
import {
  saveCourse,
  deleteCourse,
  startMaterialUpload,
  finalizeMaterial,
  deleteMaterial,
} from "@/lib/actions/courses";

// Taille max des PDF de cours (aussi la limite affichée à l'utilisateur).
const MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Upload direct navigateur → Google Drive (session resumable).
 * Le PDF ne passe pas par le serveur Next.js, donc pas de limite Vercel.
 * Renvoie { error } (null si succès) pour rester compatible avec l'appelant.
 */
async function uploadPdfDirect(
  file: File,
  courseId: string,
  title: string
): Promise<{ error: string | null }> {
  if (file.type !== "application/pdf") return { error: "NOT_PDF" };
  if (file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_PDF_BYTES) return { error: "TOO_LARGE" };

  const start = await startMaterialUpload({ courseId, fileName: title || file.name });
  if (start.error || !start.uploadUrl) {
    return { error: start.error ?? "UPLOAD_INIT_FAILED" };
  }

  let driveId: string;
  try {
    const put = await fetch(start.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    if (!put.ok) return { error: `DRIVE_PUT_${put.status}` };
    const data = (await put.json()) as { id?: string };
    if (!data.id) return { error: "DRIVE_NO_ID" };
    driveId = data.id;
  } catch {
    return { error: "DRIVE_PUT_FAILED" };
  }

  return finalizeMaterial({ courseId, title, driveId });
}

export type Material = { id: string; title: string; drive_file_id: string };

export type CourseRow = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  subjects: { name: string } | null;
  teachers: { first_name: string; last_name: string } | null;
  classes: { name: string } | null;
  course_materials: Material[];
};

export type Option = { id: string; name: string };

type SortKey = "subject" | "class" | "teacher" | "day" | "room";

const DAYS = [0, 1, 2, 3, 4, 5, 6];

function fmtTime(t: string | null) {
  return t ? t.slice(0, 5) : "";
}

export default function CoursesView({
  courses,
  classOptions,
  subjectOptions,
  teacherOptions,
  role,
  driveReady,
  defaultClassId = "",
}: {
  courses: CourseRow[];
  classOptions: Option[];
  subjectOptions: Option[];
  teacherOptions: Option[];
  role: "admin" | "teacher" | "parent";
  driveReady: boolean;
  defaultClassId?: string;
}) {
  const t = useTranslations("courses");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const canEdit = role === "admin";
  const canManageFiles = role === "admin" || role === "teacher";

  const [classFilter, setClassFilter] = useState(defaultClassId);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(
    null
  );
  const [view, setView] = useState<"list" | "timetable">("list");
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewer, setViewer] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const uploadLock = useRef(false);

  // Téléchargement direct d'un PDF depuis Google Drive
  function downloadPdf(m: Material) {
    window.open(
      `https://drive.google.com/uc?export=download&id=${m.drive_file_id}`,
      "_blank"
    );
  }

  // Téléchargement d'une archive .zip via l'endpoint serveur
  async function downloadZip(params: string) {
    if (zipping) return;
    setZipping(true);
    try {
      const res = await fetch(`/api/courses/materials/zip${params}`);
      if (!res.ok) {
        alertError(
          t("downloadAllZip"),
          res.status === 404 ? t("zipEmpty") : t("uploadFailed")
        );
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const name = match ? match[1] : "supports.zip";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      alertError(t("downloadAllZip"), t("uploadFailed"));
    } finally {
      setZipping(false);
    }
  }

  const filtered = useMemo(
    () =>
      classFilter ? courses.filter((c) => c.class_id === classFilter) : courses,
    [courses, classFilter]
  );

  function sortVal(c: CourseRow, key: SortKey): string | number {
    switch (key) {
      case "subject":
        return c.subjects?.name ?? "";
      case "class":
        return c.classes?.name ?? "";
      case "teacher":
        return c.teachers
          ? `${c.teachers.last_name} ${c.teachers.first_name}`
          : "";
      case "day":
        return c.day_of_week;
      case "room":
        return c.room ?? "";
    }
  }

  const rows = useMemo(() => {
    if (!sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortVal(a, sort.key);
      const vb = sortVal(b, sort.key);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev && prev.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" }
    );
  }

  // Le modal doit refléter les données fraîches après un upload
  const current = editing
    ? (courses.find((c) => c.id === editing.id) ?? editing)
    : null;

  function openAdd() {
    setEditing(null);
    setError(null);
    setShowForm(true);
  }

  function openCourse(c: CourseRow) {
    setEditing(c);
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await saveCourse(formData);
      if (res.error) {
        setError(res.error);
        return;
      }

      // Nouveau cours : téléverser le PDF joint dans la foulée
      const file = formData.get("material_file") as File | null;
      if (!editing && res.id && file && file.size > 0) {
        setUploading(true);
        const up = await uploadPdfDirect(
          file,
          res.id,
          (formData.get("material_title") as string) || ""
        );
        setUploading(false);
        if (up.error) {
          alertError(t("uploadFailed"), up.error);
        }
      }

      setShowForm(false);
      router.refresh();
    });
  }

  async function handleDelete(id: string) {
    const ok = await confirmDelete(t("deleteConfirm"), tc("delete"), tc("cancel"));
    if (!ok) return;
    startTransition(async () => {
      await deleteCourse(id);
      setShowForm(false);
      router.refresh();
    });
  }

  async function handleUpload(formData: FormData) {
    if (uploadLock.current) return; // bloque le double clic
    uploadLock.current = true;
    setUploading(true);
    const courseId = (formData.get("course_id") as string) || "";
    const title = (formData.get("title") as string) || "";
    const file = formData.get("file") as File | null;
    const res = file
      ? await uploadPdfDirect(file, courseId, title)
      : { error: "NO_FILE" };
    uploadLock.current = false;
    setUploading(false);
    if (res.error) {
      const key =
        res.error === "NOT_PDF"
          ? "errNotPdf"
          : res.error === "TOO_LARGE"
            ? "errTooLarge"
            : res.error === "GOOGLE_DRIVE_NOT_CONFIGURED"
              ? "errDriveConfig"
              : null;
      alertError(t("uploadFailed"), key ? t(key) : res.error);
    } else {
      router.refresh();
    }
  }

  async function handleDeleteMaterial(id: string) {
    const ok = await confirmDelete(
      t("deleteMaterialConfirm"),
      tc("delete"),
      tc("cancel")
    );
    if (!ok) return;
    startTransition(async () => {
      await deleteMaterial(id);
      router.refresh();
    });
  }

  const dayName = (d: number) => t(`day${d}` as Parameters<typeof t>[0]);

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => {
    const active = sort?.key === k;
    return (
      <th
        className={`px-4 py-3 text-start font-medium ${
          active
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
            : ""
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        >
          {label}
          {active ? (
            sort!.dir === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {tn("courses")}{" "}
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
            onClick={() => setView("timetable")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm ${
              view === "timetable"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            {t("timetableView")}
          </button>
        </div>

        {driveReady && filtered.some((c) => c.course_materials.length > 0) && (
          <button
            onClick={() => downloadZip(classFilter ? `?classId=${classFilter}` : "")}
            disabled={zipping}
            className="ms-auto flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Archive className="h-4 w-4" />
            {zipping ? t("downloadingZip") : t("downloadAllZip")}
          </button>
        )}
      </div>

      {view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <SortHeader k="subject" label={t("subject")} />
                <SortHeader k="class" label={t("class")} />
                <SortHeader k="teacher" label={t("teacher")} />
                <SortHeader k="day" label={t("day")} />
                <th className="px-4 py-3 text-start font-medium">{t("time")}</th>
                <SortHeader k="room" label={t("room")} />
                <th className="px-4 py-3 text-start font-medium">
                  <FileText className="h-4 w-4" />
                </th>
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
              {rows.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openCourse(c)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3 font-medium">
                    {c.subjects?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">{c.classes?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.teachers
                      ? `${c.teachers.first_name} ${c.teachers.last_name}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{dayName(c.day_of_week)}</td>
                  <td className="px-4 py-3" dir="ltr">
                    {fmtTime(c.start_time)} – {fmtTime(c.end_time)}
                  </td>
                  <td className="px-4 py-3">{c.room ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.course_materials.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewer(c.course_materials[0]);
                          }}
                          className="rounded-md p-1 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                          title={t("preview")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {driveReady && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              c.course_materials.length === 1
                                ? downloadPdf(c.course_materials[0])
                                : downloadZip(`?course=${c.id}`);
                            }}
                            disabled={zipping}
                            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                            title={t("download")}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          {c.course_materials.length}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {DAYS.map((d) => {
            const dayCourses = filtered
              .filter((c) => c.day_of_week === d)
              .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
            return (
              <div
                key={d}
                className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-2 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {dayName(d)}
                </div>
                <div className="space-y-2">
                  {dayCourses.length === 0 && (
                    <div className="py-3 text-center text-xs text-slate-300 dark:text-slate-600">
                      —
                    </div>
                  )}
                  {dayCourses.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCourse(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openCourse(c);
                      }}
                      className="relative w-full cursor-pointer rounded-md border border-indigo-100 bg-indigo-50 p-2 text-start text-xs hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:hover:bg-indigo-900"
                    >
                      {c.course_materials.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewer(c.course_materials[0]);
                          }}
                          title={t("preview")}
                          className="absolute end-1 top-1 rounded p-1 text-indigo-600 hover:bg-indigo-200/60 dark:text-indigo-300 dark:hover:bg-indigo-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <div className="pe-5 font-semibold text-indigo-800 dark:text-indigo-300">
                        {c.subjects?.name}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400" dir="ltr">
                        {fmtTime(c.start_time)}–{fmtTime(c.end_time)}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {c.classes?.name}
                        {c.room ? ` · ${c.room}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Modal cours ---------- */}
      {showForm && (
        <Modal
          title={current ? (canEdit ? t("edit") : (current.subjects?.name ?? "")) : t("add")}
          onClose={() => setShowForm(false)}
        >
          {canEdit && (
            <form action={handleSubmit} className="space-y-3">
              {current && <input type="hidden" name="id" value={current.id} />}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FloatSelect
                  label={t("subject")}
                  name="subject_id"
                  required
                  defaultValue={current?.subject_id ?? ""}
                >
                  <option value="" disabled></option>
                  {subjectOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </FloatSelect>
                <FloatSelect
                  label={t("class")}
                  name="class_id"
                  required
                  defaultValue={current?.class_id ?? ""}
                >
                  <option value="" disabled></option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </FloatSelect>
              </div>

              <FloatSelect
                label={t("teacher")}
                name="teacher_id"
                defaultValue={current?.teacher_id ?? ""}
              >
                <option value="">—</option>
                {teacherOptions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </FloatSelect>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FloatSelect
                  label={t("day")}
                  name="day_of_week"
                  required
                  defaultValue={String(current?.day_of_week ?? 0)}
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {dayName(d)}
                    </option>
                  ))}
                </FloatSelect>
                <FloatInput
                  label={t("room")}
                  name="room"
                  defaultValue={current?.room ?? ""}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FloatInput
                  label={t("startTime")}
                  type="time"
                  name="start_time"
                  defaultValue={fmtTime(current?.start_time ?? null)}
                />
                <FloatInput
                  label={t("endTime")}
                  type="time"
                  name="end_time"
                  defaultValue={fmtTime(current?.end_time ?? null)}
                />
              </div>

              {!current && (
                <div className="rounded-md border border-dashed border-slate-300 p-3 dark:border-slate-600">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-indigo-500" />
                    {t("materials")}
                  </p>
                  <div className="space-y-2">
                    <FloatInput label={t("materialTitle")} name="material_title" />
                    <input
                      type="file"
                      name="material_file"
                      accept="application/pdf"
                      className="w-full text-sm text-slate-500 file:me-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex items-center justify-between pt-2">
                {current ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(current.id)}
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
                    disabled={pending || uploading}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {uploading
                      ? t("uploading")
                      : pending
                        ? tc("loading")
                        : tc("save")}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ---------- Supports PDF ---------- */}
          {current && (
            <div
              className={
                canEdit
                  ? "mt-5 border-t border-slate-200 pt-4 dark:border-slate-700"
                  : ""
              }
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  {t("materials")}
                </h3>
                {driveReady && current.course_materials.length > 1 && (
                  <button
                    type="button"
                    onClick={() => downloadZip(`?course=${current.id}`)}
                    disabled={zipping}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {zipping ? t("downloadingZip") : t("downloadAllZip")}
                  </button>
                )}
              </div>

              <ul className="mb-3 space-y-1.5">
                {current.course_materials.length === 0 && (
                  <li className="text-sm text-slate-400">{t("noMaterials")}</li>
                )}
                {current.course_materials.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <span className="truncate">{m.title}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setViewer(m)}
                        className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                        title={t("view")}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {driveReady && (
                        <button
                          onClick={() => downloadPdf(m)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          title={t("download")}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      )}
                      {canManageFiles && (
                        <button
                          onClick={() => handleDeleteMaterial(m.id)}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {canManageFiles && (
                <form action={handleUpload} className="space-y-2">
                  <input type="hidden" name="course_id" value={current.id} />
                  <FloatInput label={t("materialTitle")} name="title" />
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      name="file"
                      accept="application/pdf"
                      required
                      className="flex-1 text-sm text-slate-500 file:me-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                    />
                    <button
                      type="submit"
                      disabled={uploading}
                      className="flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? t("uploading") : t("upload")}
                    </button>
                  </div>
                  {!driveReady && (
                    <p className="text-xs text-amber-600">{t("errDriveConfig")}</p>
                  )}
                </form>
              )}
            </div>
          )}
        </Modal>
      )}

      {/* ---------- Visionneuse PDF ---------- */}
      {viewer && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setViewer(null)}
        >
          <div
            className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
              <span className="truncate text-sm font-semibold">
                {viewer.title}
              </span>
              <button
                onClick={() => setViewer(null)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            <iframe
              src={`https://drive.google.com/file/d/${viewer.drive_file_id}/preview`}
              className="w-full flex-1"
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
}
