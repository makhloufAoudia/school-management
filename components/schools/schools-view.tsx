"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Plus,
  Building2,
  UserPlus,
  Copy,
  Check,
  Link2,
  Power,
  PowerOff,
  Mail,
  Trash2,
  Ban,
  ShieldCheck,
} from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { confirmDelete } from "@/lib/swal";
import {
  createSchool,
  createSchoolAdmin,
  updateSchoolAdmin,
  updateSchoolName,
  deleteSchool,
  setSchoolActive,
  setAdminBlocked,
  deleteSchoolAdmin,
  type SchoolRow,
  type SchoolAdmin,
} from "@/lib/actions/schools";

export default function SchoolsView({ schools }: { schools: SchoolRow[] }) {
  const t = useTranslations("schools");
  const tc = useTranslations("common");
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [detailFor, setDetailFor] = useState<SchoolRow | null>(null);
  const [adminFor, setAdminFor] = useState<SchoolRow | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Quel bouton a lancé l'action : lui seul affiche « Veuillez patienter ».
  const [busy, setBusy] = useState("");
  const waiting = (action: string) => pending && busy === action;

  // Traduit les clés d'erreur ERR_* renvoyées par le serveur.
  const msg = (e: string) => (e.startsWith("ERR_") ? t(e) : e);

  function handleCreateSchool(formData: FormData) {
    setBusy("createSchool");
    startTransition(async () => {
      const res = await createSchool(formData);
      if (res.error) setError(msg(res.error));
      else {
        setShowForm(false);
        setError(null);
        setCopied(false);
        setInviteLink(res.link);
        router.refresh();
      }
    });
  }

  function handleCreateAdmin(formData: FormData) {
    setBusy("createAdmin");
    if (!adminFor) return;
    startTransition(async () => {
      const res = await createSchoolAdmin(formData);
      if (res.error) setError(msg(res.error));
      else {
        setAdminFor(null);
        setError(null);
        setCopied(false);
        setInviteLink(res.link);
        router.refresh();
      }
    });
  }

  function handleUpdateAdmin(formData: FormData) {
    setBusy("updateAdmin");
    startTransition(async () => {
      const res = await updateSchoolAdmin(formData);
      if (res.error) setError(msg(res.error));
      else {
        setDetailFor(null);
        setError(null);
        router.refresh();
      }
    });
  }

  function toggleActive(s: SchoolRow) {
    setBusy("toggleActive");
    startTransition(async () => {
      const res = await setSchoolActive(s.id, !s.is_active);
      if (res.error) setError(msg(res.error));
      else {
        setDetailFor(null);
        router.refresh();
      }
    });
  }

  function handleUpdateName(id: string, name: string) {
    setBusy("updateName");
    startTransition(async () => {
      const res = await updateSchoolName(id, name);
      if (res.error) setError(msg(res.error));
      else {
        setDetailFor(null);
        setError(null);
        router.refresh();
      }
    });
  }

  async function handleDeleteSchool(s: SchoolRow) {
    setBusy("deleteSchool");
    const ok = await confirmDelete(
      t("deleteConfirm"),
      tc("delete"),
      tc("cancel"),
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteSchool(s.id);
      if (res.error) setError(msg(res.error));
      else {
        setDetailFor(null);
        setError(null);
        router.refresh();
      }
    });
  }

  // Bloque / débloque un admin : réversible, aucune donnée n'est perdue.
  function toggleAdminBlocked(a: SchoolAdmin) {
    setBusy("blockAdmin-" + a.id);
    startTransition(async () => {
      const res = await setAdminBlocked(a.id, !a.is_blocked);
      if (res.error) setError(msg(res.error));
      else {
        setError(null);
        setDetailFor(null);
        router.refresh();
      }
    });
  }

  // Supprime définitivement le compte d'un admin (l'école reste intacte).
  async function handleDeleteAdmin(a: SchoolAdmin) {
    setBusy("deleteAdmin-" + a.id);
    const ok = await confirmDelete(
      t("deleteAdminConfirm", { name: a.full_name || a.email }),
      tc("delete"),
      tc("cancel"),
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteSchoolAdmin(a.id);
      if (res.error) setError(msg(res.error));
      else {
        setError(null);
        setDetailFor(null);
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {t("title")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({schools.length})
          </span>
        </h1>
        <button
          onClick={() => {
            setError(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {t("add")}
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-400">{t("rowHint")}</p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("slug")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("adminName")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("students")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {schools.map((s) => (
              <tr
                key={s.id}
                onClick={() => {
                  setError(null);
                  setDetailFor(s);
                }}
                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    {s.name}
                  </span>
                </td>
                <td className="px-4 py-3" dir="ltr">
                  <code className="text-xs text-slate-500">{s.slug}</code>
                </td>
                <td className="px-4 py-3">
                  {s.admin_name ? (
                    <span className="flex flex-col">
                      <span>{s.admin_name}</span>
                      <span className="text-xs text-slate-400">{s.admin_email}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">{s.student_count}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      s.is_active
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {s.is_active ? t("active") : t("inactive")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Création d'une école (avec son admin obligatoire) */}
      {showForm && (
        <Modal title={t("add")} onClose={() => setShowForm(false)}>
          <form action={handleCreateSchool} className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-500">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              {t("addHint")}
            </div>
            <FloatInput label={t("name")} name="name" required />
            <FloatInput
              label={t("slug")}
              name="slug"
              dir="ltr"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            />
            <p className="text-xs text-slate-400">{t("slugHint")}</p>

            <div className="pt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {t("adminSection")}
            </div>
            <FloatInput label={t("adminName")} name="admin_name" required />
            <FloatInput
              label={t("email")}
              type="email"
              name="admin_email"
              dir="ltr"
              required
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
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
                <BusyLabel loading={waiting("createSchool")}>
                  {t("create")}
                </BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Popup détail d'une école (clic sur la ligne) */}
      {detailFor && (
        <Modal title={detailFor.name} onClose={() => setDetailFor(null)}>
          <div className="space-y-4" key={detailFor.id}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span dir="ltr">
                <code className="text-xs">{detailFor.slug}</code>
              </span>
              <span>
                {detailFor.student_count} {t("students")}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  detailFor.is_active
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {detailFor.is_active ? t("active") : t("inactive")}
              </span>
            </div>

            {/* Modifier le nom de l'école */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                handleUpdateName(
                  detailFor.id,
                  String(fd.get("school_name") || ""),
                );
              }}
              className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700"
            >
              <FloatInput
                label={t("name")}
                name="school_name"
                defaultValue={detailFor.name}
                required
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BusyLabel loading={waiting("updateName")}>
                    {tc("save")}
                  </BusyLabel>
                </button>
              </div>
            </form>

            {/* Modifier l'admin principal */}
            {detailFor.admin_id ? (
              <form action={handleUpdateAdmin} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                <input type="hidden" name="admin_id" value={detailFor.admin_id} />
                <div className="flex items-start gap-2 text-sm text-slate-500">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  {t("editAdminHint")}
                </div>
                <FloatInput
                  label={t("adminName")}
                  name="full_name"
                  defaultValue={detailFor.admin_name ?? ""}
                  required
                />
                <FloatInput
                  label={t("email")}
                  type="email"
                  name="email"
                  dir="ltr"
                  defaultValue={detailFor.admin_email ?? ""}
                  required
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BusyLabel loading={waiting("updateAdmin")}>
                      {tc("save")}
                    </BusyLabel>
                  </button>
                </div>
              </form>
            ) : (
              <p className="border-t border-slate-200 pt-4 text-sm text-slate-400 dark:border-slate-700">
                {t("noAdmin")}
              </p>
            )}

            {/* Liste des admins de l'école : blocage / suppression */}
            {detailFor.admins.length > 0 && (
              <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {t("adminsSection")} ({detailFor.admins.length})
                </div>
                <p className="text-xs text-slate-400">{t("adminsHint")}</p>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                  {detailFor.admins.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">
                          {a.full_name || "—"}
                          {a.is_blocked && (
                            <span className="ms-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-950 dark:text-red-300">
                              {t("blocked")}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-xs text-slate-400" dir="ltr">
                          {a.email}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleAdminBlocked(a)}
                          title={a.is_blocked ? t("unblockAdmin") : t("blockAdmin")}
                          aria-label={
                            a.is_blocked ? t("unblockAdmin") : t("blockAdmin")
                          }
                          className={`inline-flex items-center rounded-md p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            a.is_blocked
                              ? "text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                              : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                          }`}
                        >
                          <BusyLabel
                            loading={waiting("blockAdmin-" + a.id)}
                            iconOnly
                          >
                            {a.is_blocked ? (
                              <ShieldCheck className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </BusyLabel>
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleDeleteAdmin(a)}
                          title={t("deleteAdmin")}
                          aria-label={t("deleteAdmin")}
                          className="inline-flex items-center rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
                        >
                          <BusyLabel
                            loading={waiting("deleteAdmin-" + a.id)}
                            iconOnly
                          >
                            <Trash2 className="h-4 w-4" />
                          </BusyLabel>
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {/* Actions : ajouter un autre admin, activer/désactiver */}
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  const s = detailFor;
                  setDetailFor(null);
                  setError(null);
                  setAdminFor(s);
                }}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <UserPlus className="h-4 w-4" />
                {t("addAdmin")}
              </button>
              <button
                type="button"
                onClick={() => toggleActive(detailFor)}
                disabled={pending}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                  detailFor.is_active
                    ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                    : "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900 dark:hover:bg-green-950"
                }`}
              >
                <BusyLabel loading={waiting("toggleActive")}>
                  {detailFor.is_active ? (
                    <PowerOff className="h-4 w-4" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                  {detailFor.is_active ? t("deactivate") : t("activate")}
                </BusyLabel>
              </button>
            </div>

            {/* Zone dangereuse : suppression définitive (icône seule) */}
            <div className="flex justify-end border-t border-red-200 pt-4 dark:border-red-900/50">
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDeleteSchool(detailFor)}
                title={t("deleteSchool")}
                aria-label={t("deleteSchool")}
                className="inline-flex items-center rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
              >
                <BusyLabel loading={waiting("deleteSchool")} iconOnly>
                  <Trash2 className="h-5 w-5" />
                </BusyLabel>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Ajouter un admin supplémentaire */}
      {adminFor && (
        <Modal title={t("addAdmin")} onClose={() => setAdminFor(null)}>
          <form action={handleCreateAdmin} className="space-y-3">
            <input type="hidden" name="school_id" value={adminFor.id} />
            <div className="flex items-start gap-2 text-sm text-slate-500">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0" />
              {t("addAdminHint", { school: adminFor.name })}
            </div>
            <FloatInput label={t("adminName")} name="full_name" required />
            <FloatInput label={t("email")} type="email" name="email" dir="ltr" required />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdminFor(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {tc("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={waiting("createAdmin")}>
                  {t("create")}
                </BusyLabel>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Lien d'invitation généré */}
      {inviteLink && (
        <Modal title={t("linkTitle")} onClose={() => setInviteLink(null)}>
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-500">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
              {t("linkHint")}
            </div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                onFocusCapture={(e) => e.currentTarget.select()}
                dir="ltr"
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none dark:border-slate-600 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={copyLink}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
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
