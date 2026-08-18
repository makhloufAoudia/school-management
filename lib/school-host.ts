// ---------------------------------------------------------------------
// INACTIF EN L'ETAT — mode "adresse unique".
// NEXT_PUBLIC_ROOT_DOMAIN n'est plus definie : cette fonction renvoie donc
// toujours null sur https://maxschool.duckdns.org, et personne n'est
// rattache a un sous-domaine. Le code reste la au cas ou vous voudriez un
// jour redonner un sous-domaine a chaque ecole (voir ADRESSE-UNIQUE.md).
// ---------------------------------------------------------------------
// Extrait le slug d'école depuis l'hôte de la requête (sous-domaine).
// Exemples (root = "localhost") :
//   el-nour.localhost:3001 -> "el-nour"
//   localhost:3001          -> null
//   127.0.0.1:3001          -> null
// En production, définir NEXT_PUBLIC_ROOT_DOMAIN (ex : "monecole.com") :
//   el-nour.monecole.com    -> "el-nour"
//   www.monecole.com        -> null
//   monecole.com            -> null
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function schoolSlugFromHost(
  host: string | null | undefined,
): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase().trim();
  if (!hostname) return null;
  // Adresse IP -> pas de sous-domaine d'école.
  if (/^[0-9.]+$/.test(hostname)) return null;

  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost").toLowerCase();
  if (hostname === root) return null;

  const suffix = "." + root;
  if (!hostname.endsWith(suffix)) return null;

  const sub = hostname.slice(0, -suffix.length);
  // Un seul niveau de sous-domaine, pas "www", au format slug.
  if (!sub || sub.includes(".") || sub === "www") return null;
  if (!SLUG_RE.test(sub)) return null;
  return sub;
}
