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
  Settings,
  Building2,
  CalendarClock,
  Menu,
  X,
} from "lucide-react";
import { BusyLabel } from "@/components/ui/busy";
import LanguageSwitcher from "./language-switcher";
import ThemeToggle from "./theme-toggle";
import InstallButton from "./pwa/install-button";

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
  { href: "/salaries", key: "salaries", icon: Wallet, roles: ["teacher"] },
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
  // Déconnexion : le bouton passe en « Veuillez patienter… » le temps de la
  // requête Supabase et de la redirection.
  const [loggingOut, setLoggingOut] = useState(false);

  // On referme le tiroir dès qu'on change de page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Empêche le défilement de la page derrière le tiroir ouvert, et
  // referme le tiroir avec la touche Échap.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const linkClass = (active: boolean) =>
    `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
      active
        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 dark:bg-indigo-500"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
    }`;

  const iconClass = (active: boolean) =>
    `h-[18px] w-[18px] shrink-0 transition-colors ${
      active ? "text-white" : "text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300"
    }`;

  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";

  const brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
      <span className="truncate font-semibold tracking-tight">{tc("appName")}</span>
    </div>
  );

  return (
    <>
      {/* Barre supérieure — téléphone et tablette uniquement */}
      <header className="app-topbar no-print fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-slate-200/80 bg-white/85 px-3 backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/85">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("menu")}
          aria-expanded={open}
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        {brand}
      </header>

      {/* Voile sombre derrière le tiroir (toujours rendu pour l'animation) */}
      <div
        className={`no-print fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`app-sidebar no-print fixed inset-y-0 start-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col border-e border-slate-200 bg-white transition-[translate,box-shadow]  duration-300 ease-[cubic-bezier(.32,.72,0,1)] lg:sticky lg:top-0 lg:bottom-auto lg:z-auto lg:w-64 lg:shadow-none dark:border-slate-800 dark:bg-slate-900 ${
          open ? "shadow-2xl lg:shadow-none" : "max-lg:-translate-x-full max-lg:rtl:translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] lg:pt-5">
          {brand}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tc("close")}
            className="ms-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-2">
          {isSuperAdmin && (
            <Link
              href="/schools"
              className={linkClass(pathname.startsWith("/schools"))}
            >
              <Building2 className={iconClass(pathname.startsWith("/schools"))} />
              {t("schools")}
            </Link>
          )}
          {NAV.filter((item) =>
            (item.roles as readonly string[]).includes(role)
          ).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={linkClass(active)}
              >
                <Icon className={iconClass(active)} />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 space-y-3 border-t border-slate-200 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800">
          <InstallButton />
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title={t("logout")}
              aria-label={t("logout")}
              className="inline-flex shrink-0 items-center gap-1 rounded-md p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
            >
              <BusyLabel loading={loggingOut} iconOnly>
                <LogOut className="h-4 w-4" />
              </BusyLabel>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
