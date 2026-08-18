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
import { BusyLabel } from "@/components/ui/busy";
import { GraduationCap } from "lucide-react";

// Client dédié au « mot de passe oublié ».
//
// On n'utilise PAS le lien cliquable envoyé par e-mail, mais le CODE à
// 6 chiffres qui l'accompagne. Raison : les messageries (Gmail en tête)
// visitent automatiquement les liens d'un message pour les analyser. Le
// jeton de récupération étant à usage unique, il est consommé par ce robot
// avant que la personne ne clique — d'où des liens systématiquement
// « expirés ». Un code recopié à la main échappe à ce problème.
//
// persistSession: false → la vérification du code ne touche pas à la
// session déjà ouverte dans ce navigateur (ex : le super-admin).
function makeResetClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: false,
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
      },
    },
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

  // "login"  = connexion normale
  // "reset"  = on demande l'adresse pour envoyer le code
  // "code"   = on saisit le code reçu + le nouveau mot de passe
  const [mode, setMode] = useState<"login" | "reset" | "code">("login");
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  // Même protection que sur le formulaire de connexion : le champ s'ouvre en
  // lecture seule pour que le navigateur ne le pré-remplisse pas.
  const [resetLocked, setResetLocked] = useState(true);
  const [resetError, setResetError] = useState<string | null>(null);
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
    setResetError(null);
    setResetBusy(true);
    const supabase = makeResetClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/${locale}/set-password` },
    );
    setResetBusy(false);

    // On ne révèle jamais si l'adresse existe. En revanche, une limite
    // d'envoi ou une panne du service doit être dite : sinon l'utilisateur
    // attend un e-mail qui n'arrivera jamais.
    if (resetErr) {
      const m = resetErr.message ?? "";
      const throttled =
        resetErr.status === 429 || /rate limit|seconds|too many/i.test(m);
      setResetError(throttled ? t("resetTooMany") : t("resetFailed"));
      return;
    }

    // L'e-mail contient un code à 6 chiffres : on passe à l'écran de saisie.
    setResetSent(true);
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setMode("code");
  }

  // Vérifie le code reçu par e-mail, puis applique le nouveau mot de passe.
  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);

    if (newPassword.length < 6) {
      setResetError(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError(t("passwordMismatch"));
      return;
    }

    setResetBusy(true);
    const supabase = makeResetClient();

    // 1) Le code prouve que la personne a bien accès à cette boîte mail.
    const { error: otpErr } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "recovery",
    });
    if (otpErr) {
      setResetBusy(false);
      setResetError(t("codeInvalid"));
      return;
    }

    // 2) Session temporaire en mémoire : on change le mot de passe.
    const { error: updErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setResetBusy(false);

    if (updErr) {
      setResetError(updErr.message);
      return;
    }

    setResetDone(true);
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

                {resetError && (
                  <p className="mt-3 text-sm text-red-600">{resetError}</p>
                )}

                <button
                  type="submit"
                  disabled={resetBusy}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BusyLabel loading={resetBusy}>{t("resetSubmit")}</BusyLabel>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="mt-3 w-full text-center text-sm text-slate-500 hover:text-indigo-600 hover:underline"
                >
                  {t("backToLogin")}
                </button>
            </form>
          </div>
        ) : mode === "code" ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h1 className="text-xl font-bold">{t("codeTitle")}</h1>

            {resetDone ? (
              <>
                <p className="mb-4 mt-2 text-sm font-medium text-green-600">
                  {t("passwordChanged")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setResetDone(false);
                    setResetSent(false);
                    setPassword("");
                    setResetError(null);
                  }}
                  className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {t("backToLogin")}
                </button>
              </>
            ) : (
              <form onSubmit={handleOtp} autoComplete="off">
                <p className="mb-4 text-sm text-slate-500">
                  {t("codeSubtitle", { email })}
                </p>

                <div className="space-y-3">
                  <FloatInput
                    label={t("codeLabel")}
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    dir="ltr"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <FloatInput
                    label={t("newPassword")}
                    type="password"
                    name="new_password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <FloatInput
                    label={t("confirmPassword")}
                    type="password"
                    name="confirm_password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                {resetError && (
                  <p className="mt-3 text-sm text-red-600">{resetError}</p>
                )}

                <button
                  type="submit"
                  disabled={resetBusy}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BusyLabel loading={resetBusy}>{t("codeSubmit")}</BusyLabel>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setResetError(null);
                  }}
                  className="mt-3 w-full text-center text-sm text-slate-500 hover:text-indigo-600 hover:underline"
                >
                  {t("codeResend")}
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <BusyLabel loading={loading}>{t("submit")}</BusyLabel>
            </button>

            {/* Enseignants et parents ne s'inscrivent pas eux-mêmes : leur
                compte est créé par l'administration, qui leur envoie un lien. */}
            <p className="mt-4 text-center text-xs text-slate-500">
              {t("teacherParentHint")}
            </p>

            {!isSchool && (
              <p className="mt-3 text-center text-sm text-slate-500">
                {t("noSchool")}{" "}
                <Link href="/signup" className="text-indigo-600 hover:underline">
                  {t("createSchool")}
                </Link>
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
