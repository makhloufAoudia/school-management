import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Palette des cartes. Chaque indicateur a sa couleur : une bande en haut et
// une pastille derrière l'icône. Les classes sont écrites en entier (et non
// construites à la volée) car Tailwind ne compile que ce qu'il voit.
const ACCENTS = {
  indigo: {
    bar: "bg-indigo-500",
    badge:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300",
  },
  emerald: {
    bar: "bg-emerald-500",
    badge:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  sky: {
    bar: "bg-sky-500",
    badge: "bg-sky-50 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300",
  },
  rose: {
    bar: "bg-rose-500",
    badge: "bg-rose-50 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
  },
  violet: {
    bar: "bg-violet-500",
    badge:
      "bg-violet-50 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300",
  },
  amber: {
    bar: "bg-amber-500",
    badge: "bg-amber-50 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
  },
  teal: {
    bar: "bg-teal-500",
    badge: "bg-teal-50 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300",
  },
  fuchsia: {
    bar: "bg-fuchsia-500",
    badge:
      "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
  },
} as const;

type Accent = keyof typeof ACCENTS;

type Card = {
  label: string;
  value: string | number;
  icon: typeof Users;
  accent: Accent;
  // Page ouverte au clic. Absent = carte informative, non cliquable :
  // on ne renvoie jamais vers un écran qui serait vide pour ce profil.
  href?: string;
};

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
      {
        label: t("platformSchools"),
        value: stats.schools,
        icon: Building2,
        accent: "indigo",
        href: "/schools",
      },
      {
        label: t("platformActiveSchools"),
        value: `${stats.activeSchools} / ${stats.schools}`,
        icon: ShieldCheck,
        accent: "emerald",
        href: "/schools",
      },
      {
        label: t("platformAdmins"),
        value: stats.admins,
        icon: UserCog,
        accent: "sky",
        href: "/schools",
      },
      {
        label: t("platformBlockedAdmins"),
        value: stats.blockedAdmins,
        icon: Ban,
        accent: "rose",
        href: "/schools",
      },
      {
        label: t("totalStudents"),
        value: stats.students,
        icon: Users,
        accent: "violet",
      },
      {
        label: t("totalTeachers"),
        value: stats.teachers,
        icon: UserCog,
        accent: "teal",
      },
      {
        label: t("totalClasses"),
        value: stats.classes,
        icon: School,
        accent: "amber",
      },
      {
        label: t("platformParents"),
        value: stats.parents,
        icon: Users,
        accent: "fuchsia",
      },
      {
        label: t("monthRevenue"),
        value: stats.monthRevenue.toLocaleString(),
        icon: CreditCard,
        accent: "emerald",
      },
      {
        label: t("platformYearRevenue"),
        value: stats.yearRevenue.toLocaleString(),
        icon: Wallet,
        accent: "indigo",
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
      {
        label: t("parentChild"),
        value: kids.length,
        icon: Users,
        accent: "violet",
        href: "/students",
      },
      {
        label: t("parentClass"),
        value: classes.size,
        icon: School,
        accent: "amber",
        href: "/classes",
      },
      {
        label: t("parentDue"),
        value: due.toLocaleString(),
        icon: CreditCard,
        accent: "rose",
        href: "/payments",
      },
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
      {
        label: t("totalStudents"),
        value: students.count ?? 0,
        icon: Users,
        accent: "violet",
        href: "/students",
      },
      {
        label: t("totalTeachers"),
        value: teachers.count ?? 0,
        icon: UserCog,
        accent: "teal",
        href: "/teachers",
      },
      {
        label: t("totalClasses"),
        value: classes.count ?? 0,
        icon: School,
        accent: "amber",
        href: "/classes",
      },
      {
        label: t("monthRevenue"),
        value: revenue.toLocaleString(),
        icon: CreditCard,
        accent: "emerald",
        href: "/payments",
      },
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
          const accent = ACCENTS[card.accent];

          const body = (
            <>
              {/* Bande de couleur : identifie l'indicateur d'un coup d'œil */}
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-1 ${accent.bar}`}
              />

              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${accent.badge}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-3 text-3xl font-bold tracking-tight">
                {card.value}
              </div>

              {card.href && (
                <span className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-slate-500">
                  {t("openDetail")}
                  <ArrowRight className="h-3 w-3" />
                </span>
              )}
            </>
          );

          const base =
            "group relative block overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-900";

          // Carte cliquable : elle se soulève et signale la page ciblée.
          return card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className={`${base} cursor-pointer hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:border-indigo-700`}
            >
              {body}
            </Link>
          ) : (
            <div key={card.label} className={base}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
