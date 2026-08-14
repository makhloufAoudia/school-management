"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Users,
  UserCog,
  UsersRound,
  School,
  BookOpen,
  CreditCard,
  Wallet,
  LogOut,
  GraduationCap,
  Settings,
  Building2,
  CalendarClock,
  Menu,
  X,
} from "lucide-react";
import LanguageSwitcher from "./language-switcher";
import ThemeToggle from "./theme-toggle";

type Role = "admin" | "teacher" | "parent";

const NAV = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, roles: ["admin", "teacher", "parent"] },
  { href: "/students", key: "students", icon: Users, roles: ["admin", "teacher", "parent"] },
  { href: "/teachers", key: "teachers", icon: UserCog, roles: ["admin"] },
  { href: "/classes", key: "classes", icon: School, roles: ["admin"] },
  { href: "/courses", key: "courses", icon: BookOpen, roles: ["admin", "teacher", "parent"] },
  { href: "/schedule", key: "schedule", icon: CalendarClock, roles: ["admin", "teacher"] },
  { href: "/payments", key: "payments", icon: CreditCard, roles: ["admin", "parent"] },
  { href: "/finance", key: "finance", icon: Wallet, roles: ["admin"] },
  { href: "/users", key: "users", icon: UsersRound, roles: ["admin"] },
  { href: "/settings", key: "settings", icon: Settings, roles: ["admin", "teacher", "parent"] },
] as const;

export default function Sidebar({
  role,
  userName,
  isSuperAdmin = false,
}: {
  role: Role;
  userName: string;
  isSuperAdmin?: boolean;
}) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();

  // Sur téléphone le menu est un tiroir : masqué par défaut, ouvert par le
  // bouton de la barre du haut. À partir de « lg » il redevient une colonne
  // fixe et l'état ci-dessous n'a plus d'effet.
  const [open, setOpen] = useState(false);

  // On referme le tiroir dès qu'on change de page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Empêche le défilement de la page derrière le tiroir ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${
      active
        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <>
      {/* Barre supérieure — téléphone et tablette uniquement */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("menu")}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        <GraduationCap className="h-6 w-6 shrink-0 text-indigo-600" />
        <span className="truncate font-semibold">{tc("appName")}</span>
      </header>

      {/* Voile sombre derrière le tiroir */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${
          open ? "fixed inset-y-0 start-0 z-50 flex" : "hidden"
        } h-screen w-64 shrink-0 flex-col border-e border-slate-200 bg-white lg:sticky lg:top-0 lg:z-auto lg:flex dark:border-slate-800 dark:bg-slate-900`}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 py-4">
          <GraduationCap className="h-7 w-7 shrink-0 text-indigo-600" />
          <span className="truncate font-semibold">{tc("appName")}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tc("close")}
            className="ms-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
          {isSuperAdmin && (
            <Link
              href="/schools"
              className={linkClass(pathname.startsWith("/schools"))}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              {t("schools")}
            </Link>
          )}
          {NAV.filter((item) =>
            (item.roles as readonly string[]).includes(role)
          ).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(pathname.startsWith(item.href))}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <div className="truncate text-xs text-slate-500">{userName}</div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <LogOut className="h-4 w-4" />
            {t("logout")}
          </button>
        </div>
      </aside>
    </>
  );
}
