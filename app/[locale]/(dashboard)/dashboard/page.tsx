import { getTranslations } from "next-intl/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getPlatformStats } from "@/lib/actions/platform";
import {
  Users,
  UserCog,
  School,
  CreditCard,
  Building2,
  ShieldCheck,
  Ban,
  Wallet,
} from "lucide-react";

export const dynamic = "force-dynamic";

type Card = { label: string; value: string | number; icon: typeof Users };

// Nombre de mois (inclus) entre le mois d'inscription et le mois courant.
function monthsSince(enrollment: string | null): number {
  if (!enrollment) return 1;
  const d = new Date(enrollment);
  if (isNaN(d.getTime())) return 1;
  const now = new Date();
  const n =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth()) +
    1;
  return Math.max(1, n);
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role, isSuperAdmin } = await getSessionProfile();
  let cards: Card[] = [];

  if (isSuperAdmin) {
    // ---- Tableau de bord PLATEFORME : toutes les écoles confondues ----
    const { stats, error } = await getPlatformStats();

    if (error === "missing_service_key") {
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("platformKeyHint")}
        </div>
      );
    }

    cards = [
      { label: t("platformSchools"), value: stats.schools, icon: Building2 },
      {
        label: t("platformActiveSchools"),
        value: `${stats.activeSchools} / ${stats.schools}`,
        icon: ShieldCheck,
      },
      { label: t("platformAdmins"), value: stats.admins, icon: UserCog },
      {
        label: t("platformBlockedAdmins"),
        value: stats.blockedAdmins,
        icon: Ban,
      },
      { label: t("totalStudents"), value: stats.students, icon: Users },
      { label: t("totalTeachers"), value: stats.teachers, icon: UserCog },
      { label: t("totalClasses"), value: stats.classes, icon: School },
      { label: t("platformParents"), value: stats.parents, icon: Users },
      {
        label: t("monthRevenue"),
        value: stats.monthRevenue.toLocaleString(),
        icon: CreditCard,
      },
      {
        label: t("platformYearRevenue"),
        value: stats.yearRevenue.toLocaleString(),
        icon: Wallet,
      },
    ];
  } else if (role === "parent") {
    // ---- Tableau de bord parent : enfant(s), classe, total dû restant ----
    const [{ data: children }, { data: classDues }, { data: payments }] =
      await Promise.all([
        supabase
          .from("students")
          .select("id, class_id, enrollment_date, classes(monthly_fee, extra_fee)"),
        supabase.from("class_dues").select("class_id, amount"),
        supabase.from("payments").select("student_id, amount"),
      ]);

    const kids = children ?? [];
    const duesByClass = new Map<string, number>();
    for (const d of classDues ?? []) {
      duesByClass.set(
        d.class_id,
        (duesByClass.get(d.class_id) ?? 0) + Number(d.amount)
      );
    }
    const paidByStudent = new Map<string, number>();
    for (const p of payments ?? []) {
      paidByStudent.set(
        p.student_id,
        (paidByStudent.get(p.student_id) ?? 0) + Number(p.amount)
      );
    }

    let due = 0;
    const classes = new Set<string>();
    for (const s of kids) {
      const cls = s.classes as unknown as {
        monthly_fee: number;
        extra_fee: number;
      } | null;
      if (s.class_id) classes.add(s.class_id);
      const monthly = Number(cls?.monthly_fee ?? 0) + Number(cls?.extra_fee ?? 0);
      const expected =
        monthly * monthsSince(s.enrollment_date) +
        (s.class_id ? (duesByClass.get(s.class_id) ?? 0) : 0);
      const paid = paidByStudent.get(s.id) ?? 0;
      due += Math.max(0, expected - paid);
    }

    cards = [
      { label: t("parentChild"), value: kids.length, icon: Users },
      { label: t("parentClass"), value: classes.size, icon: School },
      { label: t("parentDue"), value: due.toLocaleString(), icon: CreditCard },
    ];
  } else {
    // ---- Tableau de bord admin / enseignant ----
    const month = new Date().toISOString().slice(0, 7); // "2026-07"
    const [students, teachers, classes, payments] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase.from("classes").select("id", { count: "exact", head: true }),
      supabase.from("payments").select("amount").gte("paid_at", `${month}-01`),
    ]);

    const revenue = (payments.data ?? []).reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    cards = [
      { label: t("totalStudents"), value: students.count ?? 0, icon: Users },
      { label: t("totalTeachers"), value: teachers.count ?? 0, icon: UserCog },
      { label: t("totalClasses"), value: classes.count ?? 0, icon: School },
      { label: t("monthRevenue"), value: revenue.toLocaleString(), icon: CreditCard },
    ];
  }

  const gridCols = cards.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">
        {isSuperAdmin ? t("platformTitle") : t("welcome")}
      </h1>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${gridCols}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <Icon className="h-5 w-5 text-indigo-500" />
              </div>
              <div className="mt-2 text-3xl font-bold">{card.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
