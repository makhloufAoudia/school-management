import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import SettingsView, {
  type YearRow,
  type SubjectRow,
  type SchoolRow,
} from "@/components/settings/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role, fullName, schoolId } = await getSessionProfile();

  const [{ data: years }, { data: subjects }, { data: school }] =
    await Promise.all([
      supabase
        .from("academic_years")
        .select("*")
        .order("sort_order")
        .order("start_date", { ascending: false }),
      supabase.from("subjects").select("*").order("name"),
      schoolId
        ? supabase
            .from("schools")
            .select("id, name, slug")
            .eq("id", schoolId)
            .single()
        : Promise.resolve({ data: null }),
    ]);

  return (
    <SettingsView
      years={(years as YearRow[]) ?? []}
      subjects={(subjects as SubjectRow[]) ?? []}
      school={(school as SchoolRow) ?? null}
      fullName={fullName}
      isAdmin={role === "admin"}
    />
  );
}
