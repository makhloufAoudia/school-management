import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { listAppUsers } from "@/lib/actions/users";
import { getTranslations } from "next-intl/server";
import UsersView from "@/components/users/users-view";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const t = await getTranslations("dashboard");
  const tu = await getTranslations("users");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { role } = await getSessionProfile();
  if (role !== "admin") {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {tu("adminOnly")}
      </div>
    );
  }

  if (!isAdminConfigured()) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{tu("title")}</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">{tu("missingKeyTitle")}</p>
          <p className="mt-1">{tu("missingKeyHint")}</p>
        </div>
      </div>
    );
  }

  const { users } = await listAppUsers();

  return <UsersView users={users} />;
}
