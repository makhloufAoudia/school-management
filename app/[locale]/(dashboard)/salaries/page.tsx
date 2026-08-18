import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import MySalariesView from "@/components/salaries/my-salaries-view";
import type { SalaryRow } from "@/components/finance/salaries-view";

export const dynamic = "force-dynamic";

// « Mes paiements » — écran de l'enseignant. Il n'y voit que ses propres
// salaires : la base filtre pour lui (policy « teacher own salaries »).
export default async function MySalariesPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();

  if (role !== "teacher") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        {t("teacherOnly")}
      </div>
    );
  }

  const { data: salaries } = await supabase
    .from("salary_payments")
    .select("*")
    .order("period", { ascending: false })
    .order("paid_at", { ascending: false });

  return <MySalariesView salaries={(salaries as SalaryRow[]) ?? []} />;
}
