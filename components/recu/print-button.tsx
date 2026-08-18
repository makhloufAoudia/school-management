"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

// Bouton d'impression du reçu. Ouvre la fenêtre d'impression du navigateur
// (« Enregistrer en PDF » y est proposé) — aucune bibliothèque nécessaire.
export default function PrintButton() {
  const t = useTranslations("receipt");
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
      <Printer className="h-4 w-4" />
      {t("print")}
    </button>
  );
}
