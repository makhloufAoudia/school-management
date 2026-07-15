"use client";

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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-e border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex shrink-0 items-center gap-2 px-4 py-4">
        <GraduationCap className="h-7 w-7 text-indigo-600" />
        <span className="font-semibold">{tc("appName")}</span>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
        {isSuperAdmin && (
          <Link
            href="/schools"
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
              pathname.startsWith("/schools")
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Building2 className="h-4 w-4" />
            {t("schools")}
          </Link>
        )}
        {NAV.filter((item) => (item.roles as readonly string[]).includes(role)).map(
          (item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(item.key)}
              </Link>
            );
          }
        )}
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
  );
}
