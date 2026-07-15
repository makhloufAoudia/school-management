"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Plus, UserPlus, Shield, Copy, Check, Link2 } from "lucide-react";
import Modal from "@/components/modal";
import { FloatInput, FloatSelect } from "@/components/ui/fields";
import { createAppUser, updateAppUserRole, type AppUser } from "@/lib/actions/users";

const ROLES = ["admin", "teacher", "parent"] as const;

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  teacher: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  parent: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export default function UsersView({ users }: { users: AppUser[] }) {
  const t = useTranslations("users");
  const tn = useTranslations("nav");
  const tc = useTranslations("common");
  const router = useRouter();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createAppUser(formData);
      if (res.error) {
        setError(res.error);
      } else {
        setShowForm(false);
        setError(null);
        setCopied(false);
        setInviteLink(res.link);
        router.refresh();
      }
    });
  }

  function handleRoleChange(formData: FormData) {
    if (!editing) return;
    const role = formData.get("role") as "admin" | "teacher" | "parent";
    startTransition(async () => {
      const res = await updateAppUserRole(editing.id, role);
      if (res.error) {
        setError(res.error);
      } else {
        setEditing(null);
        setError(null);
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
          {tn("users")}{" "}
          <span className="text-base font-normal text-slate-400">
            ({users.length})
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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-start text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3 text-start font-medium">{t("name")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("email")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("role")}</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  {t("empty")}
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr
                key={u.id}
                onClick={() => {
                  setEditing(u);
                  setError(null);
                }}
                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3 font-medium">{u.full_name || "—"}</td>
                <td className="px-4 py-3" dir="ltr">
                  {u.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[u.role]}`}
                  >
                    {t(`role_${u.role}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={t("add")} onClose={() => setShowForm(false)}>
          <form action={handleCreate} className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-slate-500">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0" />
              {t("addHint")}
            </div>

            <FloatInput label={t("name")} name="full_name" required />
            <FloatInput label={t("email")} type="email" name="email" required />
            <div className="grid grid-cols-2 gap-3">
              <FloatInput label={t("phone")} name="phone" />
              <FloatSelect label={t("role")} name="role" defaultValue="parent">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role_${r}`)}
                  </option>
                ))}
              </FloatSelect>
            </div>

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
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {pending ? tc("loading") : t("create")}
              </button>
            </div>
          </form>
        </Modal>
      )}

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

      {editing && (
        <Modal title={t("editRole")} onClose={() => setEditing(null)}>
          <form action={handleRoleChange} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Shield className="h-4 w-4" />
              {editing.full_name || editing.email}
            </div>
            <FloatSelect label={t("role")} name="role" defaultValue={editing.role}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role_${r}`)}
                </option>
              ))}
            </FloatSelect>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
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
          </form>
        </Modal>
      )}
    </div>
  );
}
