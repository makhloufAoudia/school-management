"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Plus,
  Trash2,
  Search,
  KeyRound,
  Link2,
  Copy,
  Check,
  Unlink,
  MessageCircle,
} from "lucide-react";
import Modal from "@/components/modal";
import { whatsAppLink } from "@/lib/format";
import { FloatInput, FloatSelect, FloatTextarea } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { saveStudent, deleteStudent } from "@/lib/actions/students";
import {
  createGuardianAccount,
  unlinkGuardianAccount,
} from "@/lib/actions/accounts";

export type StudentRow = {
  id: string;
  guardian_id: string | null;
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
  canDelete = true,
  canManageAccounts = true,
  defaultClassId = "",
  guardians = {},
}: {
  students: StudentRow[];
  classOptions: ClassOption[];
  canEdit: boolean;
  // L'enseignant ajoute et corrige les fiches, mais ne supprime pas et ne
  // crée pas de compte parent : ces deux gestes restent à l'administration.
  canDelete?: boolean;
  canManageAccounts?: boolean;
  defaultClassId?: string;
  // id du compte parent -> nom complet, pour l'affichage de la fiche
  guardians?: Record<string, string>;
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
  // Quel bouton a lancé l'action : lui seul affiche « Veuillez patienter ».
  const [busy, setBusy] = useState("");
  const waiting = (action: string) => pending && busy === action;

  // Compte de connexion du parent / tuteur de l'élève
  const [accountFor, setAccountFor] = useState<StudentRow | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkedExisting, setLinkedExisting] = useState(false);
  const [copied, setCopied] = useState(false);
  // Destinataire du lien, pour le bouton WhatsApp
  const [shareTo, setShareTo] = useState<{ name: string; phone: string }>({
    name: "",
    phone: "",
  });

  // Les codes ERR_* sont traduits, les messages Supabase sont affichés tels quels.
  function label(code: string) {
    return code.startsWith("ERR_") ? t(code) : code;
  }

  function openAccount(s: StudentRow) {
    setShowForm(false);
    setAccountError(null);
    setAccountFor(s);
  }

  function handleAccount(formData: FormData) {
    setBusy("account");
    setShareTo({
      name: String(formData.get("full_name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    startTransition(async () => {
      const res = await createGuardianAccount(formData);
      if (res.error) {
        setAccountError(res.error);
      } else {
        setAccountFor(null);
        setAccountError(null);
        setCopied(false);
        setLinkedExisting(res.linked);
        setInviteLink(res.link ?? "");
        router.refresh();
      }
    });
  }

  function handleUnlink(s: StudentRow) {
    if (!confirm(t("accountUnlinkConfirm"))) return;
    setBusy("unlink");
    startTransition(async () => {
      const res = await unlinkGuardianAccount(s.id);
      if (res.error) {
        setError(res.error);
      } else {
        setShowForm(false);
        router.refresh();
      }
    });
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

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
    setBusy("save");
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
    setBusy("delete");
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
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3 text-start font-medium">{t("lastName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("firstName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("class")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("birthDate")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("account")}</th>
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
                <td className="px-4 py-3">
                  {s.guardian_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      <KeyRound className="h-3 w-3" />
                      {guardians[s.guardian_id] || t("accountActive")}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {t("accountNone")}
                    </span>
                  )}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            {editing && canManageAccounts && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-indigo-600" />
                    {t("account")}
                  </span>
                  {editing.guardian_id ? (
                    <button
                      type="button"
                      onClick={() => handleUnlink(editing)}
                      disabled={pending}
                      className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      <BusyLabel loading={waiting("unlink")} size="sm">
                        <Unlink className="h-3.5 w-3.5" />
                        {t("accountUnlink")}
                      </BusyLabel>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openAccount(editing)}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      {t("accountCreate")}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {editing.guardian_id
                    ? t("accountActiveHint", {
                        name:
                          guardians[editing.guardian_id] || t("accountActive"),
                      })
                    : t("accountHint")}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{label(error)}</p>}

            <div className="flex items-center justify-between pt-2">
              {editing && canDelete ? (
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

      {accountFor && (
        <Modal
          title={t("accountTitle", {
            name: `${accountFor.first_name} ${accountFor.last_name}`.trim(),
          })}
          onClose={() => setAccountFor(null)}
        >
          <form action={handleAccount} className="space-y-3">
            <input type="hidden" name="student_id" value={accountFor.id} />

            <div className="flex items-start gap-2 text-sm text-slate-500">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              {t("accountHint")}
            </div>

            <FloatInput label={t("accountName")} name="full_name" required />
            <FloatInput
              label={t("accountEmail")}
              name="email"
              type="email"
              required
            />
            <FloatInput label={t("accountPhone")} name="phone" type="tel" />

            {accountError && (
              <p className="text-sm text-red-600">{label(accountError)}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAccountFor(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={waiting("account")}>
                  {t("accountSubmit")}
                </BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {inviteLink !== null && (
        <Modal title={t("linkTitle")} onClose={() => setInviteLink(null)}>
          <div className="space-y-3">
            {linkedExisting || !inviteLink ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t("accountLinked")}
              </p>
            ) : (
              <>
                <div className="flex items-start gap-2 text-sm text-slate-500">
                  <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("linkHint")}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.target.select()}
                    dir="ltr"
                    className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none dark:border-slate-600 dark:bg-slate-800"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? t("copied") : t("copy")}
                  </button>
                </div>
                <a
                  href={whatsAppLink(
                    shareTo.phone,
                    t("waMessage", { name: shareTo.name, link: inviteLink })
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t("whatsapp")}
                </a>
                <a
                  href={whatsAppLink(
                    shareTo.phone,
                    t("waMessage", { name: shareTo.name, link: inviteLink }),
                    "app"
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-slate-500 hover:underline"
                >
                  {t("whatsappApp")}
                </a>
              </>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInviteLink(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
