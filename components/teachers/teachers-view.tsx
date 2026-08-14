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
import { FloatInput, FloatSelect } from "@/components/ui/fields";
import { saveTeacher, deleteTeacher } from "@/lib/actions/teachers";
import {
  createTeacherAccount,
  unlinkTeacherAccount,
} from "@/lib/actions/accounts";

export type TeacherRow = {
  id: string;
  profile_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  base_salary: number;
  hire_date: string | null;
  is_active: boolean;
};

export default function TeachersView({
  teachers,
  canEdit,
}: {
  teachers: TeacherRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("teachers");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Compte de connexion de l'enseignant
  const [accountFor, setAccountFor] = useState<TeacherRow | null>(null);
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

  function openAccount(x: TeacherRow) {
    setShowForm(false);
    setAccountError(null);
    setAccountFor(x);
  }

  function handleAccount(formData: FormData) {
    setShareTo({
      name: String(formData.get("full_name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
    });
    startTransition(async () => {
      const res = await createTeacherAccount(formData);
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

  function handleUnlink(x: TeacherRow) {
    if (!confirm(t("accountUnlinkConfirm"))) return;
    startTransition(async () => {
      const res = await unlinkTeacherAccount(x.id);
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
    if (!q) return teachers;
    return teachers.filter((x) =>
      `${x.first_name} ${x.last_name} ${x.specialty ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [teachers, search]);

  function openAdd() {
    setEditing(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(x: TeacherRow) {
    setEditing(x);
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await saveTeacher(formData);
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
      await deleteTeacher(id);
      setShowForm(false);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {tn("teachers")}{" "}
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

      <div className="mb-4">
        <div className="relative w-fit">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tc("search")}
            className="rounded-md border border-slate-300 bg-white py-2 pe-3 ps-9 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3 text-start font-medium">{t("lastName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("firstName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("specialty")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("phone")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("baseSalary")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("status")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("account")}</th>
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
            {filtered.map((x) => (
              <tr
                key={x.id}
                onClick={() => canEdit && openEdit(x)}
                className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                  canEdit
                    ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    : ""
                }`}
              >
                <td className="px-4 py-3 font-medium">{x.last_name}</td>
                <td className="px-4 py-3">{x.first_name}</td>
                <td className="px-4 py-3">{x.specialty ?? "—"}</td>
                <td className="px-4 py-3" dir="ltr">
                  {x.phone ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {Number(x.base_salary).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      x.is_active
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {x.is_active ? t("active") : t("inactive")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {x.profile_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      <KeyRound className="h-3 w-3" />
                      {t("accountActive")}
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
              <FloatInput
                label={t("phone")}
                name="phone"
                type="tel"
                defaultValue={editing?.phone ?? ""}
              />
              <FloatInput
                label={t("email")}
                name="email"
                type="email"
                defaultValue={editing?.email ?? ""}
              />
            </div>

            <FloatInput
              label={t("specialty")}
              name="specialty"
              defaultValue={editing?.specialty ?? ""}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FloatInput
                label={t("baseSalary")}
                type="number"
                name="base_salary"
                min={0}
                step="0.01"
                defaultValue={editing?.base_salary ?? 0}
              />
              <FloatInput
                label={t("hireDate")}
                type="date"
                name="hire_date"
                defaultValue={editing?.hire_date ?? ""}
              />
              <FloatSelect
                label={t("status")}
                name="is_active"
                defaultValue={String(editing?.is_active ?? true)}
              >
                <option value="true">{t("active")}</option>
                <option value="false">{t("inactive")}</option>
              </FloatSelect>
            </div>

            {editing && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4 text-indigo-600" />
                    {t("account")}
                  </span>
                  {editing.profile_id ? (
                    <button
                      type="button"
                      onClick={() => handleUnlink(editing)}
                      disabled={pending}
                      className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      {t("accountUnlink")}
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
                  {editing.profile_id ? t("accountActiveHint") : t("accountHint")}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{label(error)}</p>}

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

      {accountFor && (
        <Modal title={t("accountTitle")} onClose={() => setAccountFor(null)}>
          <form action={handleAccount} className="space-y-3">
            <input type="hidden" name="teacher_id" value={accountFor.id} />

            <div className="flex items-start gap-2 text-sm text-slate-500">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              {t("accountHint")}
            </div>

            <FloatInput
              label={t("accountName")}
              name="full_name"
              required
              defaultValue={`${accountFor.first_name} ${accountFor.last_name}`.trim()}
            />
            <FloatInput
              label={t("accountEmail")}
              name="email"
              type="email"
              required
              defaultValue={accountFor.email ?? ""}
            />
            <FloatInput
              label={t("phone")}
              name="phone"
              type="tel"
              defaultValue={accountFor.phone ?? ""}
            />

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
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {pending ? tc("loading") : t("accountSubmit")}
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
