import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import ClassesView, {
  type ClassRow,
  type FeeHistoryRow,
  type TeacherOption,
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

  // Page réservée à l'administration : un enseignant (ou un parent) qui
  // taperait l'adresse à la main tombe sur ce message, pas sur la liste.
  if (role !== "admin") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {t("adminOnly")}
      </div>
    );
  }

  const isAdmin = role === "admin";

  const [{ data: year }, { data: classes }, feeHistoryRes, teachersRes] =
    await Promise.all([
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
    // Liste des enseignants, pour choisir le professeur principal.
    isAdmin
      ? supabase
          .from("teachers")
          .select("id, first_name, last_name")
          .eq("is_active", true)
          .order("last_name")
      : Promise.resolve({ data: [] }),
  ]);

  type RawTeacher = { id: string; first_name: string; last_name: string };
  const teacherOptions: TeacherOption[] = (
    (teachersRes.data as RawTeacher[] | null) ?? []
  ).map((x) => ({ id: x.id, name: `${x.first_name} ${x.last_name}` }));

  return (
    <ClassesView
      classes={(classes as ClassRow[]) ?? []}
      feeHistory={(feeHistoryRes.data as FeeHistoryRow[]) ?? []}
      yearId={year?.id ?? null}
      yearLabel={year?.label ?? ""}
      teacherOptions={teacherOptions}
      canEdit={isAdmin}
    />
  );
}
