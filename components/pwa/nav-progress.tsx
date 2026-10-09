"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Fine barre de progression en haut de l'écran pendant le changement de
 * page : l'utilisateur voit immédiatement que son clic est pris en compte,
 * même si le serveur met une seconde à répondre.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fin de navigation : la page a changé.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 350);
  }, [pathname, search]);

  // Début de navigation : clic sur un lien interne vers une autre page.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (timer.current) clearTimeout(timer.current);
      setState("loading");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (state === "idle") return null;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div className={`nav-progress h-full bg-gradient-to-r from-indigo-400 via-indigo-600 to-violet-500 ${state === "done" ? "nav-progress-done" : ""}`} />
    </div>
  );
}
