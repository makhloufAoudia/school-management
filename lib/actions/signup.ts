"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Inscription libre d'une école : un directeur crée son école et son compte
// admin en une seule étape (aucun passage par Supabase). Chaque inscription
// génère une nouvelle école isolée (slug = sous-domaine).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Convertit un nom d'école en slug (minuscules, chiffres, tirets).
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

// Renvoie un slug libre : base, puis base-2, base-3, ...
async function uniqueSlug(admin: AdminClient, base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  while (n < 1000) {
    const { data } = await admin
      .from("schools")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

// Construit l'URL de connexion sur le sous-domaine de l'école.
async function schoolLoginUrl(slug: string): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root) return null; // sans domaine racine configuré, pas de sous-domaine
  const port = host.includes(":") ? ":" + host.split(":")[1] : "";
  return `${proto}://${slug}.${root}${port}/fr/login`;
}

export async function signUpSchool(formData: FormData): Promise<{
  error: string | null;
  slug: string | null;
  loginUrl: string | null;
}> {
  const admin = createAdminClient();
  if (!admin) {
    return { error: "SERVICE_UNAVAILABLE", slug: null, loginUrl: null };
  }

  const schoolName = ((formData.get("school_name") as string) || "").trim();
  const fullName = ((formData.get("full_name") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const password = (formData.get("password") as string) || "";

  if (!schoolName) return { error: "SCHOOL_NAME_REQUIRED", slug: null, loginUrl: null };
  if (!fullName) return { error: "NAME_REQUIRED", slug: null, loginUrl: null };
  if (!EMAIL_RE.test(email)) return { error: "EMAIL_INVALID", slug: null, loginUrl: null };
  if (password.length < 8) return { error: "PASSWORD_TOO_SHORT", slug: null, loginUrl: null };

  const base = slugify(schoolName);
  if (!base) return { error: "SCHOOL_NAME_INVALID", slug: null, loginUrl: null };
  const slug = await uniqueSlug(admin, base);

  // 1) Création de l'école + son année scolaire par défaut (RPC).
  const { data: schoolId, error: rpcErr } = await admin.rpc("provision_school", {
    p_name: schoolName,
    p_slug: slug,
  });
  if (rpcErr || !schoolId) {
    return { error: rpcErr?.message ?? "SCHOOL_CREATE_FAILED", slug: null, loginUrl: null };
  }

  // 2) Création du compte admin avec mot de passe (email confirmé d'office).
  //    Le trigger handle_new_user crée le profil (role admin + school_id)
  //    à partir des métadonnées.
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: "admin",
      school_id: schoolId as string,
    },
  });

  if (cErr) {
    // Rollback : on retire l'école pour ne pas laisser d'orpheline.
    await admin.from("schools").delete().eq("id", schoolId as string);
    // Message plus clair si l'e-mail est déjà pris.
    const msg = /already|exist|registered/i.test(cErr.message)
      ? "EMAIL_TAKEN"
      : cErr.message;
    return { error: msg, slug: null, loginUrl: null };
  }

  // 3) Sécurité : on force les champs du profil (au cas où le trigger diffère).
  const userId = created?.user?.id;
  if (userId) {
    await admin
      .from("profiles")
      .update({ full_name: fullName, role: "admin", school_id: schoolId as string })
      .eq("id", userId);
  }

  const loginUrl = await schoolLoginUrl(slug);
  return { error: null, slug, loginUrl };
}
