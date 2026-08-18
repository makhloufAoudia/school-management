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
  Loader2,
  Info,
} from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { alertError, confirmDelete } from "@/lib/swal";
import {
  saveCourse,
  deleteCourse,
  startMaterialUpload,
  finalizeMaterial,
  uploadMaterial,
  deleteMaterial,
} from "@/lib/actions/courses";

// Taille max des PDF de cours (aussi la limite affichée à l'utilisateur).
const MAX_PDF_BYTES = 15 * 1024 * 1024;
// Au-delà, le PDF ne peut plus transiter par le serveur (limite Vercel ~4,5 Mo).
const MAX_VIA_SERVEUR_BYTES = 4 * 1024 * 1024;

/**
 * Envoi par le serveur : le PDF transite par la server action, qui le dépose
 * sur Drive. Simple et fiable, mais limité par la taille de corps acceptée
 * par Vercel. Sert de secours quand l'envoi direct échoue.
 */
async function uploadPdfViaServeur(
  file: File,
  courseId: string,
  title: string
): Promise<{ error: string | null }> {
  const fd = new FormData();
  fd.set("course_id", courseId);
  fd.set("title", title);
  fd.set("file", file);
  return uploadMaterial(fd);
}

/**
 * Upload direct navigateur → Google Drive (session resumable).
 * Le PDF ne passe pas par le serveur Next.js, donc pas de limite Vercel.
 * Si ce chemin échoue (extension de navigateur, proxy d'entreprise, réseau
 * mobile filtrant… — tout ce qui casse une requête cross-origin), on retente
 * automatiquement par le serveur tant que le fichier n'est pas trop gros.
 * Renvoie { error } (null si succès) pour rester compatible avec l'appelant.
 */
async function uploadPdfDirect(
  file: File,
  courseId: string,
  title: string,
  onProgress?: (pct: number | null) => void
): Promise<{ error: string | null }> {
  if (file.type !== "application/pdf") return { error: "NOT_PDF" };
  if (file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_PDF_BYTES) return { error: "TOO_LARGE" };

  const secours = async (raison: string) => {
    if (file.size > MAX_VIA_SERVEUR_BYTES) return { error: raison };
    // Le renvoi par le serveur ne remonte pas d'avancement : barre indéterminée.
    onProgress?.(null);
    const res = await uploadPdfViaServeur(file, courseId, title);
    // Si le secours échoue aussi, on remonte la cause d'origine : plus utile
    // pour comprendre que l'erreur du second essai.
    return res.error ? { error: `${raison} / ${res.error}` } : res;
  };

  onProgress?.(0);
  const start = await startMaterialUpload({ courseId, fileName: title || file.name });
  if (start.error || !start.uploadUrl) {
    return { error: start.error ?? "UPLOAD_INIT_FAILED" };
  }

  const put = await putAvecProgression(start.uploadUrl, file, (pct) =>
    // On garde les 100 % pour la fin (enregistrement en base compris).
    onProgress?.(Math.min(99, pct))
  );
  if (put.status === 0) return secours("DRIVE_PUT_FAILED");
  if (put.status < 200 || put.status >= 300) return secours(`DRIVE_PUT_${put.status}`);

  let driveId: string;
  try {
    const data = JSON.parse(put.body) as { id?: string };
    if (!data.id) return secours("DRIVE_NO_ID");
    driveId = data.id;
  } catch {
    return secours("DRIVE_NO_ID");
  }

  onProgress?.(null);
  return finalizeMaterial({ courseId, title, driveId });
}

/**
 * PUT en XMLHttpRequest plutôt qu'en fetch : c'est le seul moyen d'obtenir
 * l'avancement réel de l'envoi (xhr.upload.onprogress) pour l'afficher.
 * Ne rejette jamais : status 0 = échec réseau, traité par l'appelant.
 */
function putAvecProgression(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => resolve({ status: 0, body: "" });
    xhr.onabort = () => resolve({ status: 0, body: "" });
    xhr.send(file);
  });
}

export type Material = { id: string; title: string; drive_file_id: string };

export type CourseRow = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
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

// Les dates arrivent en ISO (yyyy-mm-dd) : c'est aussi ce qu'attend
// <input type="date">, donc on ne coupe que l'éventuelle partie horaire.
function fmtDateInput(d: string | null) {
  return d ? d.slice(0, 10) : "";
}

// Affichage court et local (jj/mm/aaaa en français) pour les tableaux.
function fmtDateLabel(d: string | null) {
  if (!d) return "";
  const parsed = new Date(d + "T00:00:00");
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString();
}

export default function CoursesView({
  courses,
  classOptions,
  subjectOptions,
  teacherOptions,
  role,
  driveReady,
  defaultClassId = "",
  editableClassIds = [],
  myTeacherId = null,
}: {
  courses: CourseRow[];
  classOptions: Option[];
  subjectOptions: Option[];
  teacherOptions: Option[];
  role: "admin" | "teacher" | "parent";
  driveReady: boolean;
  defaultClassId?: string;
  /** Enseignant : classes où il peut créer un cours (prof principal ou déjà en poste). */
  editableClassIds?: string[];
  /** Enseignant : sa propre fiche ; le cours créé lui est attribué. */
  myTeacherId?: string | null;
}) {
  const t = useTranslations("courses");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  // canEdit  : modifier ou supprimer un cours existant — administration seule.
  // canCreate: créer un cours — l'enseignant aussi, dans ses classes.
  const canEdit = role === "admin";
  const canCreate =
    role === "admin" ||
    (role === "teacher" && !!myTeacherId && editableClassIds.length > 0);
  const canManageFiles = role === "admin" || role === "teacher";
  // Un enseignant qui n'est rattaché à aucune classe ne peut pas créer de
  // cours. Plutôt que de faire disparaître le bouton sans un mot, on lui
  // explique pourquoi et ce qui doit se passer pour que cela change.
  const teacherWithoutClass = role === "teacher" && !canCreate;

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
  // Quel bouton a lancé l'action : lui seul affiche « Veuillez patienter ».
  const [busy, setBusy] = useState("");
  const waiting = (action: string) => pending && busy === action;
  const [uploading, setUploading] = useState(false);
  // null = envoi en cours sans pourcentage connu (phase serveur)
  const [progress, setProgress] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  // Quelle archive est en préparation : seul ce bouton affiche l'attente.
  const [zipFor, setZipFor] = useState("");
  const zipWaiting = (params: string) => zipping && zipFor === params;
  const uploadLock = useRef(false);

  // Libellé du bouton pendant l'envoi : « Veuillez patienter… 42 % ».
  // Le pourcentage est conservé après le texte d'attente : il rassure sur le
  // fait que le téléversement avance vraiment (la barre est juste en dessous).
  const uploadingLabel =
    progress === null
      ? tc("pleaseWait")
      : `${tc("pleaseWait")} ${progress}%`;

  // Barre d'avancement affichée sous le formulaire d'envoi.
  // Appelée en fonction (et non comme composant) pour que la barre ne soit pas
  // remontée à chaque rendu : la transition de largeur reste fluide.
  const renderProgressBar = () => (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div
        className={`h-full rounded-full bg-indigo-600 transition-[width] duration-200 ${
          progress === null ? "w-1/3 animate-pulse" : ""
        }`}
        style={progress === null ? undefined : { width: `${progress}%` }}
      />
    </div>
  );

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
    setZipFor(params);
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

  // Classes proposées dans le formulaire : toutes pour l'administration,
  // seulement les siennes pour l'enseignant.
  const formClassOptions = useMemo(
    () =>
      role === "admin"
        ? classOptions
        : classOptions.filter((c) => editableClassIds.includes(c.id)),
    [role, classOptions, editableClassIds]
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
        // Les cours sans jour fixe (période seule) partent en fin de liste.
        return c.day_of_week ?? 99;
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
    setBusy("save");
    startTransition(async () => {
      const res = await saveCourse(formData);
      if (res.error) {
        // Les erreurs métier remontent sous forme de clé traduisible.
        setError(
          res.error === "ERR_dateOrder" ? t("ERR_dateOrder") : res.error
        );
        return;
      }

      // Nouveau cours : téléverser le PDF joint dans la foulée
      const file = formData.get("material_file") as File | null;
      if (!editing && res.id && file && file.size > 0) {
        setProgress(0);
        setUploading(true);
        const up = await uploadPdfDirect(
          file,
          res.id,
          (formData.get("material_title") as string) || "",
          setProgress
        );
        setUploading(false);
        setProgress(null);
        if (up.error) {
          alertError(t("uploadFailed"), up.error);
        }
      }

      setShowForm(false);
      router.refresh();
    });
  }

  async function handleDelete(id: string) {
    setBusy("delete");
    const ok = await confirmDelete(t("deleteConfirm"), tc("delete"), tc("cancel"));
    if (!ok) return;
    startTransition(async () => {
      await deleteCourse(id);
      setShowForm(false);
      router.refresh();
    });
  }

  // Renvoie true si l'envoi a réussi (pour vider le formulaire ensuite).
  async function handleUpload(formData: FormData): Promise<boolean> {
    if (uploadLock.current) return false; // bloque le double clic
    uploadLock.current = true;
    setProgress(0);
    setUploading(true);
    // Remet l'interface au repos, quoi qu'il arrive.
    const auRepos = () => {
      uploadLock.current = false;
      setUploading(false);
      setProgress(null);
    };
    const courseId = (formData.get("course_id") as string) || "";
    const title = (formData.get("title") as string) || "";
    const file = formData.get("file") as File | null;
    let res: { error: string | null };
    try {
      res = file
        ? await uploadPdfDirect(file, courseId, title, setProgress)
        : { error: "NO_FILE" };
    } catch (e) {
      auRepos();
      alertError(t("uploadFailed"), e instanceof Error ? e.message : String(e));
      return false;
    }
    auRepos();
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
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleDeleteMaterial(id: string) {
    setBusy("deleteMaterial-" + id);
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

  const dayName = (d: number | null) =>
    d === null || d === undefined
      ? "—"
      : t(`day${d}` as Parameters<typeof t>[0]);

  // Un cours peut n'avoir qu'une période (du ... au ...) sans créneau hebdo.
  const periodLabel = (c: CourseRow) => {
    const from = fmtDateLabel(c.start_date);
    const to = fmtDateLabel(c.end_date);
    if (from && to) return `${from} → ${to}`;
    if (from) return `${t("fromDate")} ${from}`;
    if (to) return `${t("toDate")} ${to}`;
    return "";
  };

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
        {canCreate && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </button>
        )}
      </div>

      {teacherWithoutClass && (
        <div className="mb-6 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">{t("noClassTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed">{t("noClassHelp")}</p>
          </div>
        </div>
      )}

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
            className="ms-auto flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <BusyLabel
              loading={zipWaiting(classFilter ? `?classId=${classFilter}` : "")}
            >
              <Archive className="h-4 w-4" />
              {t("downloadAllZip")}
            </BusyLabel>
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
                  <td className="px-4 py-3">
                    <span dir="ltr">
                      {c.start_time || c.end_time
                        ? `${fmtTime(c.start_time)} – ${fmtTime(c.end_time)}`
                        : "—"}
                    </span>
                    {periodLabel(c) && (
                      <span
                        className="mt-0.5 block text-xs text-slate-400"
                        dir="ltr"
                      >
                        {periodLabel(c)}
                      </span>
                    )}
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
                            className="inline-flex items-center rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                            title={t("download")}
                          >
                            <BusyLabel
                              loading={zipWaiting(`?course=${c.id}`)}
                              iconOnly
                            >
                              <Download className="h-4 w-4" />
                            </BusyLabel>
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
          {(canEdit || (!current && canCreate)) && (
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
                  {formClassOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </FloatSelect>
              </div>

              {canEdit ? (
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
              ) : (
                // L'enseignant se crée un cours à lui-même : pas de choix à
                // faire, et le serveur revérifie de toute façon.
                <input type="hidden" name="teacher_id" value={myTeacherId ?? ""} />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FloatSelect
                  label={t("day")}
                  name="day_of_week"
                  defaultValue={
                    current?.day_of_week === null ||
                    current?.day_of_week === undefined
                      ? ""
                      : String(current.day_of_week)
                  }
                >
                  <option value="">{t("noFixedDay")}</option>
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

              {/* Période du cours : un cours n'est pas forcément lié à un
                  seul jour ni à une heure précise, il peut courir d'une
                  date à une autre. Les deux champs sont facultatifs. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FloatInput
                  label={t("startDate")}
                  type="date"
                  name="start_date"
                  defaultValue={fmtDateInput(current?.start_date ?? null)}
                />
                <FloatInput
                  label={t("endDate")}
                  type="date"
                  name="end_date"
                  defaultValue={fmtDateInput(current?.end_date ?? null)}
                />
              </div>
              <p className="-mt-1 text-xs text-slate-400">{t("periodHint")}</p>

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
                      disabled={uploading}
                      className="w-full min-w-0 text-sm text-slate-500 file:me-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 disabled:opacity-50 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                    />
                    {uploading && renderProgressBar()}
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
                    disabled={pending || uploading}
                    aria-busy={pending || uploading}
                    className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {uploadingLabel}
                      </>
                    ) : (
                      <BusyLabel loading={pending}>{tc("save")}</BusyLabel>
                    )}
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
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <BusyLabel
                      loading={zipWaiting(`?course=${current.id}`)}
                      size="sm"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      {t("downloadAllZip")}
                    </BusyLabel>
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
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <span className="min-w-0 flex-1 truncate" title={m.title}>
                      {m.title}
                    </span>
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
                          disabled={waiting("deleteMaterial-" + m.id)}
                          title={tc("delete")}
                          className="inline-flex items-center rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
                        >
                          <BusyLabel
                            loading={waiting("deleteMaterial-" + m.id)}
                            iconOnly
                          >
                            <Trash2 className="h-4 w-4" />
                          </BusyLabel>
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {canManageFiles && (
                <form
                  // onSubmit et non `action={handleUpload}` : avec `action`,
                  // React exécute la fonction dans une transition, et le
                  // passage à « Veuillez patienter » n'était jamais peint
                  // (aucun useTransition ici ne force le rendu). En onSubmit,
                  // setUploading est une mise à jour urgente : le bouton
                  // change dès le clic.
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    void handleUpload(new FormData(form)).then((ok) => {
                      // Succès : on vide le champ fichier, comme le faisait
                      // la remise à zéro automatique de `action`.
                      if (ok) form.reset();
                    });
                  }}
                  className="w-full space-y-2"
                >
                  <input type="hidden" name="course_id" value={current.id} />
                  <FloatInput label={t("materialTitle")} name="title" />
                  {/* min-w-0 : sans lui, un nom de fichier long élargit la ligne
                      et fait déborder tout le modal horizontalement. */}
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="file"
                      name="file"
                      accept="application/pdf"
                      required
                      disabled={uploading}
                      className="w-full min-w-0 flex-1 text-sm text-slate-500 file:me-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 disabled:opacity-50 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                    />
                    <button
                      type="submit"
                      disabled={uploading}
                      aria-busy={uploading}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {uploadingLabel}
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          {t("upload")}
                        </>
                      )}
                    </button>
                  </div>
                  {uploading && renderProgressBar()}
                  {/* DIAGNOSTIC TEMPORAIRE — à retirer une fois la cause
                      identifiée. Montre l'état réel de l'envoi. */}
                  <p className="text-[11px] text-slate-400">
                    diag v3 · envoi={String(uploading)} · progression=
                    {String(progress)}
                  </p>
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
