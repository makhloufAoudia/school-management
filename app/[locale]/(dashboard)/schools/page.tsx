import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { listSchools } from "@/lib/actions/schools";
import { getTranslations } from "next-intl/server";
import SchoolsView from "@/components/schools/schools-view";

export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const t = await getTranslations("dashboard");
  const ts = await getTranslations("schools");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { isSuperAdmin } = await getSessionProfile();
  if (!isSuperAdmin) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {ts("superAdminOnly")}
      </div>
    );
  }

  if (!isAdminConfigured()) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{ts("title")}</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">{ts("missingKeyTitle")}</p>
          <p className="mt-1">{ts("missingKeyHint")}</p>
        </div>
      </div>
    );
  }

  const { schools } = await listSchools();

  return <SchoolsView schools={schools} />;
}
