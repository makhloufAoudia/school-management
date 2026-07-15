"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { assertSchoolMember, assertPlatformAccess } from "@/lib/actions/tenant";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { FloatInput } from "@/components/ui/fields";
import { GraduationCap } from "lucide-react";

export default function LoginForm({
  slug = null,
  schoolName = null,
  schoolInactive = false,
}: {
  slug?: string | null;
  schoolName?: string | null;
  schoolInactive?: boolean;
}) {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<
    null | "creds" | "notMember" | "platformOnly"
  >(null);
  const [loading, setLoading] = useState(false);

  const isSchool = Boolean(slug && schoolName && !schoolInactive);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      setLoading(false);
      setError("creds");
      return;
    }

    if (isSchool && slug) {
      // Sous-domaine d'école : seuls les comptes de cette école entrent.
      const res = await assertSchoolMember(slug);
      if (!res.ok) {
        await supabase.auth.signOut();
        setLoading(false);
        setError("notMember");
        return;
      }
    } else {
      // Espace plateforme (apex) : réservé au super-administrateur.
      const res = await assertPlatformAccess();
      if (!res.ok) {
        await supabase.auth.signOut();
        setLoading(false);
        setError("platformOnly");
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-indigo-600" />
            <span className="text-lg font-semibold">{tc("appName")}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        {schoolInactive ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {t("schoolInactive")}
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <h1 className="text-xl font-bold">
              {isSchool ? schoolName : t("title")}
            </h1>
            <p className="mb-4 text-sm text-slate-500">
              {isSchool ? t("schoolSubtitle") : t("subtitle")}
            </p>

            <div className="space-y-3">
              <FloatInput
                label={t("email")}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FloatInput
                label={t("password")}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="mb-4" />

            {error === "creds" && (
              <p className="mb-3 text-sm text-red-600">{t("error")}</p>
            )}
            {error === "notMember" && (
              <p className="mb-3 text-sm text-red-600">{t("notMember")}</p>
            )}
            {error === "platformOnly" && (
              <p className="mb-3 text-sm text-red-600">{t("platformOnly")}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? tc("loading") : t("submit")}
            </button>

            {!isSchool && (
              <p className="mt-4 text-center text-sm text-slate-500">
                Pas encore d&apos;école ?{" "}
                <Link href="/signup" className="text-indigo-600 hover:underline">
                  Créer une école
                </Link>
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
