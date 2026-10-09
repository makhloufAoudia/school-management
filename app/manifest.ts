import type { MetadataRoute } from "next";

// Manifeste de l'application installable (PWA).
// Servi automatiquement par Next.js à l'adresse /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Gestion Scolaire",
    short_name: "MaxSchool",
    description: "Gestion d'école privée : élèves, enseignants, cours, finances",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#121a2b",
    theme_color: "#4f46e5",
    lang: "fr",
    dir: "auto",
    categories: ["education", "productivity", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
