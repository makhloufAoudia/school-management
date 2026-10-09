"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// L'événement peut arriver avant que le bouton ne soit monté (il est émis
// très tôt par Chrome) : on le capte au niveau du module.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

/**
 * Bouton « Installer l'application ».
 * - Chrome, Edge, Brave, Samsung… : ouvre la fenêtre d'installation native.
 * - iPhone / iPad (Safari) : pas d'API d'installation, on affiche la marche
 *   à suivre (Partager → Sur l'écran d'accueil).
 * - Déjà installée : le bouton n'apparaît pas.
 */
export default function InstallButton({ className = "" }: { className?: string }) {
  const t = useTranslations("common");
  const [canPrompt, setCanPrompt] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setIos(isIos());
    const sync = () => setCanPrompt(Boolean(deferred));
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  if (!canPrompt && !ios) return null;

  async function install() {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    setCanPrompt(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={install}
        className={`flex w-full items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 active:scale-[.98] dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25 ${className}`}
      >
        <Download className="h-4 w-4 shrink-0" />
        {t("installApp")}
      </button>

      {showIosHelp && (
        <div
          className="anim-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="anim-sheet w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t("installApp")}</h2>
              <button
                onClick={() => setShowIosHelp(false)}
                aria-label={t("close")}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
              {t("installIosHelp1")}
              <Share className="inline h-4 w-4 text-indigo-600" />
              {t("installIosHelp2")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
