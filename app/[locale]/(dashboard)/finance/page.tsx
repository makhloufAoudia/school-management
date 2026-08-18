import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import SalariesView, {
  type SalaryRow,
  type TeacherOption,
} from "@/components/finance/salaries-view";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();

  // Page réservée à l'administration : elle contient les salaires versés.
  if (role !== "admin") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {t("adminOnly")}
      </div>
    );
  }

  const [{ data: salaries }, { data: teachers }] = await Promise.all([
    supabase
      .from("salary_payments")
      .select("*, teachers(first_name, last_name)")
      .order("period", { ascending: false })
      .order("paid_at", { ascending: false }),
    supabase
      .from("teachers")
      .select("id, first_name, last_name")
      .eq("is_active", true)
      .order("last_name"),
  ]);

  const teacherOptions: TeacherOption[] = (
    (teachers as { id: string; first_name: string; last_name: string }[] | null) ??
    []
  ).map((x) => ({ id: x.id, name: `${x.last_name} ${x.first_name}` }));

  return (
    <SalariesView
      salaries={(salaries as SalaryRow[]) ?? []}
      teacherOptions={teacherOptions}
    />
  );
}
