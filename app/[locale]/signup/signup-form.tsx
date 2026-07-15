"use client";

import { useState } from "react";
import Link from "next/link";
import { signUpSchool } from "@/lib/actions/signup";
import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { FloatInput } from "@/components/ui/fields";
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
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <h1 className="text-xl font-bold">Créer une école</h1>
            <p className="mb-4 text-sm text-slate-500">
              Inscris ton établissement et crée ton compte administrateur.
            </p>

            <div className="space-y-3">
              <FloatInput label="Nom de l'école" name="school_name" required />
              <FloatInput label="Ton nom complet" name="full_name" required />
              <FloatInput label="Adresse e-mail" type="email" name="email" required />
              <FloatInput
                label="Mot de passe (8 caractères min.)"
                type="password"
                name="password"
                required
              />
            </div>
            <div className="mb-4" />

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Création…" : "Créer mon école"}
            </button>

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
