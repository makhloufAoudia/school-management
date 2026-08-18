// =====================================================================
//  Adresse unique du site.
//
//  Toute l'application vit sur UNE SEULE adresse : celle definie par
//  NEXT_PUBLIC_SITE_URL (ex : https://maxschool.duckdns.org).
//
//  Tous les liens fabriques par le serveur (invitation d'un enseignant
//  ou d'un parent, definition du mot de passe, lien de connexion apres
//  inscription d'une ecole) passent par cette fonction. Resultat : le
//  lien envoye pointe toujours vers l'adresse publique, meme si vous
//  avez ouvert l'application depuis http://localhost:3001.
//
//  Si la variable n'est pas definie, on retombe sur l'hote de la
//  requete (pratique en developpement).
// =====================================================================

import { headers } from "next/headers";

const ADRESSE_SITE = (process.env.NEXT_PUBLIC_SITE_URL || "")
  .trim()
  .replace(/\/+$/, "");

export async function siteOrigin(): Promise<string> {
  if (ADRESSE_SITE) return ADRESSE_SITE;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
