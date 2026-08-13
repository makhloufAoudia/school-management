"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBrowserClient } from "@supabase/ssr";
import { assertSchoolMember, assertAnyAccess } from "@/lib/actions/tenant";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { FloatInput } from "@/components/ui/fields";
import { GraduationCap } from "lucide-react";

// Client dédié à la demande « mot de passe oublié ».
//
// Par défaut, Supabase utilise le flux PKCE : le lien reçu par e-mail
// contient un `?code=` qui ne peut être échangé QUE par le navigateur ayant
// fait la demande, via un secret stocké localement. Résultat : le lien ne
// marche pas si on l'ouvre depuis le téléphone, une autre session, ou si le
// stockage local a été vidé entre-temps.
//
// En mode `implicit`, le lien contient directement les jetons : il
// fonctionne depuis n'importe quel appareil. C'est le comportement attendu
// d'un lien de récupération envoyé par e-mail.
function makeResetClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: false, flowType: "implicit" } },
  );
}

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
  const locale = useLocale();
  const router = useRouter();

  // "login" = connexion normale, "reset" = demande de nouveau mot de passe.
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  // Même protection que sur le formulaire de connexion : le champ s'ouvre en
  // lecture seule pour que le navigateur ne le pré-remplisse pas.
  const [resetLocked, setResetLocked] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<
    null | "creds" | "notMember" | "platformOnly" | "schoolInactive"
  >(null);
  const [loading, setLoading] = useState(false);

  const isSchool = Boolean(slug && schoolName && !schoolInactive);

  // ---- « Enregistrer mes informations » ---------------------------------
  // Case cochée  : l'e-mail est mémorisé sur cet appareil et pré-rempli, et
  //                le navigateur est libre de compléter le mot de passe.
  // Case décochée : le formulaire s'ouvre vide, et on empêche activement le
  //                navigateur de le remplir (champs en lecture seule au
  //                chargement + le mot de passe n'est pas un champ de type
  //                `password` tant qu'on n'a pas cliqué dedans : sans lui,
  //                aucun gestionnaire de mots de passe ne reconnaît le
  //                formulaire).
  const STORE_KEY = "school.login.email";
  const [remember, setRemember] = useState(false);
  // `hardened` : mode anti-remplissage. Actif tant que rien n'est mémorisé
  // et que l'utilisateur n'a pas cliqué dans le formulaire.
  const [hardened, setHardened] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const touched = useRef(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORE_KEY);
    } catch {
      /* stockage indisponible (navigation privée stricte) */
    }

    if (saved) {
      // L'utilisateur a demandé qu'on retienne ses informations : on
      // pré-remplit et on laisse le navigateur faire le reste.
      setEmail(saved);
      setRemember(true);
      setHardened(false);
      return;
    }

    // Rien de mémorisé : filet de sécurité, on repasse derrière le
    // navigateur s'il remplit les champs malgré le mode anti-remplissage.
    const clear = () => {
      if (touched.current) return;
      formRef.current?.reset();
      setEmail("");
      setPassword("");
    };
    const timers = [0, 60, 250, 600, 1200].map((d) => setTimeout(clear, d));
    return () => timers.forEach(clearTimeout);
  }, []);

  function unlock() {
    touched.current = true;
    setHardened(false);
  }

  // Mémorise (ou oublie) l'adresse selon la case, après une connexion réussie.
  function persistEmail(value: string, keep: boolean) {
    try {
      if (keep) window.localStorage.setItem(STORE_KEY, value);
      else window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* stockage indisponible : on ignore, la connexion reste valable */
    }
  }

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
      // Domaine unique : tout compte valide entre par cette page. L'école
      // est déduite du profil, pas de l'adresse. L'isolation des données
      // reste assurée par la RLS Supabase et le school_id du profil.
      const res = await assertAnyAccess();
      if (!res.ok) {
        await supabase.auth.signOut();
        setLoading(false);
        setError(res.reason === "inactive" ? "schoolInactive" : "platformOnly");
        return;
      }
    }

    // Connexion réussie : on mémorise l'adresse si la case est cochée.
    persistEmail(email, remember);

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  // Mot de passe oublié : Supabase envoie un e-mail contenant un lien de
  // récupération qui ramène sur /set-password (cette page sait déjà traiter
  // les jetons de type "recovery"). On affiche toujours le même message,
  // que l'adresse existe ou non : révéler l'existence d'un compte
  // permettrait d'énumérer les utilisateurs.
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetBusy(true);
    const supabase = makeResetClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${locale}/set-password`,
    });
    setResetBusy(false);
    setResetSent(true);
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
        ) : mode === "reset" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-xl font-bold">{t("resetTitle")}</h1>

            {resetSent ? (
              <>
                <p className="mb-4 mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {t("resetSent")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setResetSent(false);
                  }}
                  className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {t("backToLogin")}
                </button>
              </>
            ) : (
              <form onSubmit={handleReset} autoComplete="off">
                <p className="mb-4 text-sm text-slate-500">
                  {t("resetSubtitle")}
                </p>
                <FloatInput
                  label={t("email")}
                  type="email"
                  name="reset_email"
                  autoComplete="off"
                  readOnly={resetLocked}
                  onFocus={() => setResetLocked(false)}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={resetBusy}
                  className="mt-4 w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {resetBusy ? tc("loading") : t("resetSubmit")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="mt-3 w-full text-center text-sm text-slate-500 hover:text-indigo-600 hover:underline"
                >
                  {t("backToLogin")}
                </button>
              </form>
            )}
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            // Premier clic / première frappe : l'utilisateur prend la main,
            // on lève le mode anti-remplissage.
            onFocus={unlock}
            onKeyDown={unlock}
            autoComplete={remember ? "on" : "off"}
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
                name="email"
                autoComplete={remember ? "username" : "off"}
                readOnly={hardened}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FloatInput
                label={t("password")}
                // Devient un vrai champ password dès le premier clic : tant
                // qu'il est en `text`, aucun gestionnaire de mots de passe ne
                // reconnaît le formulaire et ne le remplit.
                type={hardened ? "text" : "password"}
                name="password"
                autoComplete={remember ? "current-password" : "off"}
                readOnly={hardened}
                onMouseEnter={unlock}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => {
                  const on = e.target.checked;
                  setRemember(on);
                  if (on) unlock();
                  // Décoché : on oublie tout de suite l'adresse mémorisée.
                  if (!on) persistEmail("", false);
                }}
                className="h-4 w-4 cursor-pointer accent-indigo-600"
              />
              {t("remember")}
            </label>

            <div className="mt-2 text-end">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setResetSent(false);
                  setResetLocked(true);
                  // On n'emporte l'adresse dans l'écran suivant QUE si
                  // l'utilisateur a demandé qu'on la retienne. Sinon le champ
                  // s'ouvre vide, comme partout ailleurs.
                  if (!remember) setEmail("");
                  setPassword("");
                  setMode("reset");
                }}
                className="text-sm text-indigo-600 hover:underline"
              >
                {t("forgot")}
              </button>
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
            {error === "schoolInactive" && (
              <p className="mb-3 text-sm text-red-600">{t("schoolInactive")}</p>
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
