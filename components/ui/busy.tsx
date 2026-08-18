"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Contenu de bouton qui bascule en « Veuillez patienter… » (+ roue animée)
 * tant que l'action déclenchée par le bouton n'est pas terminée.
 *
 * Usage :
 *   <button disabled={busy === "save"}>
 *     <BusyLabel loading={busy === "save"}>{tc("save")}</BusyLabel>
 *   </button>
 *
 * Le bouton doit être en `inline-flex items-center gap-2` pour que la roue
 * et le texte soient alignés.
 */
export function BusyLabel({
  loading,
  children,
  size = "md",
  iconOnly = false,
}: {
  loading: boolean;
  children: React.ReactNode;
  /** `sm` pour les petits boutons (texte xs), `md` par défaut. */
  size?: "sm" | "md";
  /** Bouton sans texte (icône seule) : on n'affiche que la roue. */
  iconOnly?: boolean;
}) {
  const tc = useTranslations("common");
  if (!loading) return <>{children}</>;
  return (
    <>
      <Loader2
        className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 animate-spin`}
        aria-hidden
      />
      {iconOnly ? <span className="sr-only">{tc("pleaseWait")}</span> : tc("pleaseWait")}
    </>
  );
}

export default BusyLabel;
