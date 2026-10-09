/* Service worker — Gestion Scolaire
 * Rôle volontairement minimal (aucune tâche de fond, aucune synchro) :
 *  1. rendre l'application installable ;
 *  2. servir instantanément les fichiers statiques déjà vus (JS, CSS,
 *     icônes) — ils ont un nom unique par version, donc sans risque ;
 *  3. afficher une page « hors connexion » propre au lieu de l'écran
 *     d'erreur du navigateur.
 * Les pages et les données (Supabase, actions serveur) ne sont JAMAIS
 * mises en cache : elles viennent toujours du serveur.
 */
const VERSION = "v1";
const STATIC_CACHE = `school-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("school-") && k !== STATIC_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // actions serveur, envois : on ne touche à rien
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Google… : direct

  // Pages : toujours le réseau ; page hors connexion en secours.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Fichiers statiques versionnés : cache d'abord, réseau sinon.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
