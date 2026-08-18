import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

// ---------------------------------------------------------------------
// Adresse unique : tout ce qui arrive par une autre adresse publique
// (ancienne URL .vercel.app, previsualisation, sous-domaine d'ecole...)
// est renvoye vers NEXT_PUBLIC_SITE_URL, en gardant la page demandee.
// Le developpement local (localhost, 127.0.0.1) n'est pas touche.
// ---------------------------------------------------------------------
const HOTE_CANONIQUE = (process.env.NEXT_PUBLIC_SITE_URL || "")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "")
  .split("/")[0]
  .toLowerCase();

function estLocal(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    /^[0-9.]+$/.test(hostname)
  );
}

export default async function middleware(request: NextRequest) {
  if (HOTE_CANONIQUE) {
    const hote = (
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      ""
    ).toLowerCase();
    const hostname = hote.split(":")[0];

    if (hostname && hostname !== HOTE_CANONIQUE && !estLocal(hostname)) {
      const cible = new URL(
        request.nextUrl.pathname + request.nextUrl.search,
        `https://${HOTE_CANONIQUE}`,
      );
      // 307 (temporaire) : rien n'est mis en cache definitivement dans les
      // navigateurs, on peut donc changer d'adresse plus tard sans souci.
      return NextResponse.redirect(cible, 307);
    }
  }

  const response = intlMiddleware(request);
  return await updateSession(request, response);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
