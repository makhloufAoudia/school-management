"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createBrowserClient } from "@supabase/ssr";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { FloatInput } from "@/components/ui/fields";
import { GraduationCap } from "lucide-react";

// Client dédié à cette page : detectSessionInUrl = false pour que NOUS
// contrôlions la lecture des jetons du lien (sinon le hash est consommé et
// effacé avant qu'on puisse le lire). flowType implicite = jetons dans le hash.
function makeInviteClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: false, flowType: "implicit" } },
  );
}

export default function SetPasswordPage() {
  const t = useTranslations("setPassword");
  const tc = useTranslations("common");
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = makeInviteClient();
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(
      url.hash.startsWith("#") ? url.hash.slice(1) : "",
    );
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const token_hash = url.searchParams.get("token_hash") ?? hash.get("token_hash");
    const otpType = (url.searchParams.get("type") ?? hash.get("type")) as
      | "invite"
      | "recovery"
      | "signup"
      | "email"
      | null;
    const code = url.searchParams.get("code");

    async function init() {
      try {
        // On repart TOUJOURS d'une session propre : sinon on agirait sur le
        // compte déjà connecté dans ce navigateur (ex : le super-admin), et
        // changer le mot de passe modifierait le mauvais compte.
        await supabase.auth.signOut({ scope: "local" });

        let ok = false;
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          ok = !error;
        } else if (token_hash && otpType) {
          const { error } = await supabase.auth.verifyOtp({
            type: otpType,
            token_hash,
          });
          ok = !error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          ok = !error;
        }

        // Retire les jetons sensibles de l'URL.
        window.history.replaceState(null, "", url.pathname);

        if (ok) setReady(true);
        else setInvalid(true);
      } catch {
        setInvalid(true);
      }
    }
    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setLoading(true);
    const supabase = makeInviteClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1200);
    }
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

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="mb-4 text-sm text-slate-500">{t("subtitle")}</p>

          {done ? (
            <p className="text-sm font-medium text-green-600">{t("success")}</p>
          ) : invalid ? (
            <p className="text-sm text-red-600">{t("invalidLink")}</p>
          ) : !ready ? (
            <p className="text-sm text-slate-500">{tc("loading")}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <FloatInput
                label={t("password")}
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FloatInput
                label={t("confirm")}
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? tc("loading") : t("submit")}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
