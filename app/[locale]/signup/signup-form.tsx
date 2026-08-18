"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signUpSchool } from "@/lib/actions/signup";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { FloatInput } from "@/components/ui/fields";
import { BusyLabel } from "@/components/ui/busy";
import { GraduationCap, CheckCircle2 } from "lucide-react";

// Messages d'erreur (français). L'app est multilingue mais l'inscription
// reste volontairement simple pour l'instant.
const ERRORS: Record<string, string> = {
  SCHOOL_NAME_REQUIRED: "Le nom de l'école est requis.",
  SCHOOL_NAME_INVALID: "Le nom de l'école n'est pas valide.",
  NAME_REQUIRED: "Ton nom est requis.",
  EMAIL_INVALID: "Adresse e-mail invalide.",
  EMAIL_TAKEN: "Cette adresse e-mail est déjà utilisée.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 8 caractères.",
  SERVICE_UNAVAILABLE: "Service indisponible. Réessaie plus tard.",
  SCHOOL_CREATE_FAILED: "La création de l'école a échoué. Réessaie.",
};

export default function SignupForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ slug: string; loginUrl: string | null } | null>(
    null
  );

  const formRef = useRef<HTMLFormElement>(null);
  // Vrai dès que l'utilisateur touche le formulaire : on ne l'efface plus.
  const touched = useRef(false);

  // ---- Anti pré-remplissage du navigateur -------------------------------
  // Firefox et Chrome ignorent volontairement `autocomplete="off"` pour les
  // identifiants enregistrés dans leur gestionnaire de mots de passe.
  // Parade en deux couches :
  //  1) les champs démarrent en lecture seule — un gestionnaire de mots de
  //     passe ne remplit jamais un champ readonly. Le premier clic dans le
  //     formulaire les débloque (voir onFocus sur le <form>) ;
  //  2) le champ mot de passe n'est PAS un `type="password"` au chargement.
  //     C'est la parade décisive : un gestionnaire de mots de passe ne
  //     reconnaît un formulaire de connexion QUE s'il y trouve un champ de
  //     type password. Sans lui, il ne remplit ni le mot de passe ni
  //     l'e-mail associé. Le champ redevient un vrai `password` dès que
  //     l'utilisateur clique dedans, avant même sa première frappe ;
  //  3) filet de sécurité : on vide le formulaire à plusieurs instants après
  //     l'affichage, au cas où le navigateur remplirait malgré tout.
  const [locked, setLocked] = useState(true);
  const [pwdReady, setPwdReady] = useState(false);

  function unlock() {
    touched.current = true;
    setLocked(false);
  }

  useEffect(() => {
    const clear = () => {
      if (touched.current) return;
      formRef.current?.reset();
    };
    const timers = [0, 60, 250, 600, 1200].map((d) => setTimeout(clear, d));
    // Retour en arrière du navigateur (bfcache) : la page est restaurée
    // telle quelle, avec ses champs remplis. On la nettoie aussi.
    const onShow = () => clear();
    window.addEventListener("pageshow", onShow);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await signUpSchool(formData);
    setLoading(false);
    if (res.error) {
      setError(ERRORS[res.error] ?? res.error);
      return;
    }
    setDone({ slug: res.slug!, loginUrl: res.loginUrl });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-indigo-600" />
            <span className="text-lg font-semibold">Gestion Scolaire</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        {done ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-sm dark:border-emerald-900 dark:bg-emerald-950">
            <div className="mb-3 flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              École créée !
            </div>
            <p className="mb-3 text-slate-700 dark:text-slate-300">
              Ton compte administrateur est prêt. Connecte-toi à l'espace de ton
              école :
            </p>
            {done.loginUrl ? (
              <a
                href={done.loginUrl}
                className="block break-all rounded-md bg-indigo-600 px-3 py-2 text-center font-medium text-white hover:bg-indigo-700"
              >
                Aller à mon espace
              </a>
            ) : (
              <p className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                Ton école : <strong>{done.slug}</strong>. Connecte-toi via le
                sous-domaine <strong>{done.slug}</strong> de la plateforme.
              </p>
            )}
          </div>
        ) : (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            // Premier clic / première frappe : l'utilisateur prend la main.
            // On déverrouille les champs et on coupe le nettoyage auto.
            onFocus={unlock}
            onKeyDown={unlock}
            // autoComplete="off" : le navigateur ne pré-remplit plus les
            // champs (fond jaune) avec un compte enregistré précédemment.
            autoComplete="off"
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <h1 className="text-xl font-bold">Créer une école</h1>
            <p className="mb-4 text-sm text-slate-500">
              Inscris ton établissement et crée ton compte administrateur.
            </p>

            <div className="space-y-3">
              <FloatInput
                label="Nom de l'école"
                name="school_name"
                autoComplete="off"
                readOnly={locked}
                required
              />
              <FloatInput
                label="Ton nom complet"
                name="full_name"
                autoComplete="off"
                readOnly={locked}
                required
              />
              <FloatInput
                label="Adresse e-mail"
                type="email"
                name="email"
                autoComplete="off"
                readOnly={locked}
                required
              />
              <FloatInput
                label="Mot de passe (8 caractères min.)"
                // Devient un vrai champ password au premier clic (voir le
                // commentaire « Anti pré-remplissage » en haut du fichier).
                type={pwdReady ? "password" : "text"}
                name="password"
                // "new-password" : indique au navigateur qu'il s'agit d'une
                // création de compte, donc pas de mot de passe mémorisé.
                autoComplete="new-password"
                readOnly={locked}
                onFocus={() => setPwdReady(true)}
                onMouseEnter={() => setPwdReady(true)}
                required
              />
            </div>
            <div className="mb-4" />

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="reset"
                onClick={() => setError(null)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Réinitialiser
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BusyLabel loading={loading}>Créer mon école</BusyLabel>
              </button>
            </div>

            <p className="mt-4 text-center text-sm text-slate-500">
              Déjà un compte ?{" "}
              <Link href="/login" className="text-indigo-600 hover:underline">
                Se connecter
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
