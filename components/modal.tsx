"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Échap ferme la fenêtre ; la page derrière ne défile plus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="anim-sheet max-h-[92dvh] w-full max-w-lg overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl ring-1 ring-slate-900/5 sm:my-auto sm:rounded-2xl sm:p-6 dark:bg-slate-900 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Poignée — rappelle un panneau mobile natif */}
        <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden dark:bg-slate-700" />
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
