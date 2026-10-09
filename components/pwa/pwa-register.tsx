"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker (une seule fois, après le chargement de la
 * page pour ne pas ralentir l'affichage). En développement on l'évite : le
 * cache gênerait le rechargement à chaud.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
