import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import ClassesView, {
  type ClassRow,
  type FeeHistoryRow,
} from "@/components/classes/classes-view";

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();

  const isAdmin = role === "admin";

  const [{ data: year }, { data: classes }, feeHistoryRes] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, label")
      .eq("is_current", true)
      .single(),
    supabase.from("classes").select("*, students(count)").order("name"),
    // L'historique des tarifs n'est visible que par l'admin.
    isAdmin
      ? supabase
          .from("class_fee_history")
          .select("id, class_id, old_fee, new_fee, changed_at")
          .order("changed_at", { ascending: false })
      : Promise.resolve({ data: [] as FeeHistoryRow[] }),
  ]);

  return (
    <ClassesView
      classes={(classes as ClassRow[]) ?? []}
      feeHistory={(feeHistoryRes.data as FeeHistoryRow[]) ?? []}
      yearId={year?.id ?? null}
      yearLabel={year?.label ?? ""}
      canEdit={isAdmin}
    />
  );
}
