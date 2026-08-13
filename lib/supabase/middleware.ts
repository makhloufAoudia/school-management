import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { schoolSlugFromHost } from "@/lib/school-host";

const PUBLIC_PATHS = ["/login", "/signup", "/set-password"];

function stripLocale(pathname: string) {
  return pathname.replace(/^\/(fr|ar|tzm|en)(?=\/|$)/, "") || "/";
}

export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  // Sans config Supabase, on laisse passer (phase de setup)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Rafraîchit la session. En cas d'erreur réseau/incident temporaire côté
  // Supabase, getUser peut échouer : on NE déconnecte PAS l'utilisateur.
  let user = null;
  let checkFailed = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    if (error) checkFailed = true;
  } catch {
    checkFailed = true;
  }

  const path = stripLocale(request.nextUrl.pathname);
  const isPublic = path === "/" || PUBLIC_PATHS.some((p) => path.startsWith(p));
  const locale = request.nextUrl.pathname.split("/")[1] || "fr";
  const currentSlug = schoolSlugFromHost(request.headers.get("host"));

  // Un cookie de session Supabase est-il présent ?
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes("auth-token"));

  // Redirige vers /login (du MÊME hôte) en conservant les cookies renouvelés.
  function toLogin(clearSession: boolean) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    if (clearSession) {
      request.cookies.getAll().forEach((c) => {
        if (c.name.includes("auth-token")) redirect.cookies.delete(c.name);
      });
    }
    return redirect;
  }

  // 1) Aucun utilisateur : on protège les pages privées.
  if (!user && !isPublic) {
    // Si un cookie existe mais que la vérification a échoué (incident
    // temporaire), on laisse passer pour éviter les déconnexions intempestives.
    if (hasSessionCookie && checkFailed) return response;
    return toLogin(false);
  }

  // 2) Utilisateur connecté : contrôle du locataire.
  //    - Sur un sous-domaine d'école : seuls les membres de CETTE école
  //      passent. Règle inchangée, au cas où vous réactiveriez les
  //      sous-domaines plus tard.
  //    - Sur le domaine racine (mode actuel) : tout profil rattaché à une
  //      école passe, ainsi que le super-admin. L'isolation des données
  //      repose alors sur la RLS Supabase et le school_id du profil, ce qui
  //      était déjà le cas — le contrôle par l'hôte n'était qu'une couche
  //      supplémentaire.
  if (user) {
    let resolved = false;
    let isSuper = false;
    let isBlocked = false;
    let ownSlug: string | null = null;
    try {
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("is_super_admin, school_id, is_blocked")
        .eq("id", user.id)
        .single();
      if (!pErr && prof) {
        resolved = true;
        isSuper = Boolean(prof.is_super_admin);
        isBlocked = Boolean(prof.is_blocked);
        if (prof.school_id) {
          const { data: sch } = await supabase
            .from("schools")
            .select("slug")
            .eq("id", prof.school_id)
            .single();
          ownSlug = sch?.slug ?? null;
        }
      }
    } catch {
      resolved = false;
    }

    // On n'applique le blocage QUE si on a pu résoudre le profil (sinon on
    // évite de verrouiller à tort lors d'un incident base de données).
    if (resolved) {
      // Compte bloqué par le super-admin : déconnexion immédiate, y compris
      // si une session était déjà ouverte.
      if (isBlocked) {
        return toLogin(true);
      }
      const allowed = currentSlug
        ? ownSlug === currentSlug
        : Boolean(isSuper || ownSlug);
      if (!allowed && !isPublic) {
        return toLogin(true);
      }
    }
  }

  return response;
}
