// =====================================================================
//  Ajout automatique du sous-domaine d'une école sur Vercel.
//
//  Pourquoi ce fichier existe : le certificat wildcard (*.domaine) exige
//  que les serveurs de noms soient délégués à Vercel. Avec un domaine
//  DuckDNS, c'est impossible. On contourne en déclarant chaque
//  sous-domaine d'école un par un via l'API — Vercel émet alors un
//  certificat individuel, automatiquement.
//
//  Le DNS, lui, fonctionne déjà : DuckDNS résout n'importe quel
//  sous-domaine vers la même adresse.
//
//  Règle d'or : cette fonction ne doit JAMAIS faire échouer une
//  inscription. Si Vercel refuse, l'école est créée quand même et le
//  sous-domaine sera ajouté à la main.
// =====================================================================

export type ResultatDomaine =
  | { ok: true; etat: "cree" | "existe_deja" | "ignore"; domaine: string | null }
  | { ok: false; etat: "erreur"; domaine: string | null; message: string };

/**
 * Déclare `slug.<ROOT_DOMAIN>` sur le projet Vercel.
 *
 * Ne fait rien si les variables ne sont pas configurées : utile en
 * développement local et si vous hébergez ailleurs que sur Vercel.
 */
export async function ajouterSousDomaineEcole(
  slug: string,
): Promise<ResultatDomaine> {
  const racine = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const token = process.env.VERCEL_API_TOKEN;
  const projet = process.env.VERCEL_PROJECT_ID;
  const equipe = process.env.VERCEL_TEAM_ID;

  if (!racine || !token || !projet) {
    return { ok: true, etat: "ignore", domaine: null };
  }
  // En local, `localhost` n'est pas un domaine déclarable.
  if (racine === "localhost" || racine.startsWith("localhost:")) {
    return { ok: true, etat: "ignore", domaine: null };
  }

  const domaine = `${slug}.${racine}`;
  const url =
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projet)}/domains` +
    (equipe ? `?teamId=${encodeURIComponent(equipe)}` : "");

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domaine }),
      // L'inscription ne doit pas rester bloquée si Vercel ne répond pas.
      signal: AbortSignal.timeout(10_000),
    });

    if (reponse.ok) {
      return { ok: true, etat: "cree", domaine };
    }

    // 409 : le domaine est déjà rattaché au projet. C'est un succès.
    if (reponse.status === 409) {
      return { ok: true, etat: "existe_deja", domaine };
    }

    const corps = await reponse.text();
    return {
      ok: false,
      etat: "erreur",
      domaine,
      message: `Vercel a répondu ${reponse.status} : ${corps.slice(0, 300)}`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, etat: "erreur", domaine, message };
  }
}
