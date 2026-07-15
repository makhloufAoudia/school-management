"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSessionProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export type SchoolRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  admin_count: number;
  student_count: number;
  // Admin principal (le premier admin rattaché à l'école), s'il existe.
  admin_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
};

// Garde : renvoie le client service_role UNIQUEMENT si l'appelant est
// super-admin plateforme. Toutes les actions de ce fichier passent par elle.
async function requireSuperAdmin() {
  const { isSuperAdmin } = await getSessionProfile();
  if (!isSuperAdmin) return { admin: null, error: "unauthorized" as const };
  const admin = createAdminClient();
  if (!admin) return { admin: null, error: "missing_service_key" as const };
  return { admin, error: null };
}

type AdminClient = NonNullable<
  Awaited<ReturnType<typeof requireSuperAdmin>>["admin"]
>;

async function getRequestHost(): Promise<{ host: string; proto: string }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return { host, proto };
}

// Origine du sous-domaine d'une école : <proto>://<slug>.<apex>
// (l'admin d'école se connecte et définit son mot de passe sur SON sous-domaine).
function schoolOrigin(proto: string, host: string, slug: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  let apex = host;
  if (root) {
    const port = host.includes(":") ? ":" + host.split(":")[1] : "";
    apex = root + port;
  }
  return `${proto}://${slug}.${apex}`;
}

// Slug : minuscules, chiffres et tirets (sert d'identifiant / sous-domaine).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Convertit un texte libre (nom d'école) en slug valide.
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Renvoie un slug unique : essaie `base`, puis base-2, base-3, ...
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

// Invite un admin pour une école : génère le lien d'invitation (vers le
// sous-domaine de l'école) et rattache le profil (nom, rôle admin, école).
async function inviteAdmin(
  admin: AdminClient,
  schoolId: string,
  slug: string,
  email: string,
  full_name: string,
): Promise<{ error: string | null; link: string | null }> {
  const { host, proto } = await getRequestHost();
  const redirectTo = `${schoolOrigin(proto, host, slug)}/fr/set-password`;

  const { data, error: gErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name, role: "admin", school_id: schoolId },
      redirectTo,
    },
  });
  if (gErr) return { error: gErr.message, link: null };

  const userId = data?.user?.id;
  if (userId) {
    await admin
      .from("profiles")
      .update({ full_name, role: "admin", school_id: schoolId })
      .eq("id", userId);
  }

  return { error: null, link: data?.properties?.action_link ?? null };
}

export async function listSchools(): Promise<{
  schools: SchoolRow[];
  error: string | null;
}> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { schools: [], error };

  const [
    { data: schools, error: sErr },
    { data: profiles },
    { data: students },
    { data: usersList },
  ] = await Promise.all([
    admin.from("schools").select("id, name, slug, is_active, created_at").order("created_at"),
    admin.from("profiles").select("id, full_name, school_id, role"),
    admin.from("students").select("school_id"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (sErr) return { schools: [], error: sErr.message };

  const emailById = new Map<string, string>();
  for (const u of usersList?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const adminBySchool = new Map<string, number>();
  const primaryAdmin = new Map<string, { id: string; name: string }>();
  for (const p of profiles ?? []) {
    if (p.role === "admin" && p.school_id) {
      adminBySchool.set(p.school_id, (adminBySchool.get(p.school_id) ?? 0) + 1);
      if (!primaryAdmin.has(p.school_id)) {
        primaryAdmin.set(p.school_id, { id: p.id, name: p.full_name ?? "" });
      }
    }
  }
  const studBySchool = new Map<string, number>();
  for (const s of students ?? []) {
    if (s.school_id) studBySchool.set(s.school_id, (studBySchool.get(s.school_id) ?? 0) + 1);
  }

  const rows: SchoolRow[] = (schools ?? []).map((s) => {
    const pa = primaryAdmin.get(s.id) ?? null;
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      is_active: s.is_active,
      created_at: s.created_at,
      admin_count: adminBySchool.get(s.id) ?? 0,
      student_count: studBySchool.get(s.id) ?? 0,
      admin_id: pa?.id ?? null,
      admin_name: pa?.name ?? null,
      admin_email: pa ? emailById.get(pa.id) ?? null : null,
    };
  });

  return { schools: rows, error: null };
}

export async function createSchool(formData: FormData): Promise<{
  error: string | null;
  id: string | null;
  link: string | null;
}> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { error, id: null, link: null };

  const name = ((formData.get("name") as string) || "").trim();
  const rawSlug = ((formData.get("slug") as string) || "").trim().toLowerCase();
  const adminName = ((formData.get("admin_name") as string) || "").trim();
  const adminEmail = ((formData.get("admin_email") as string) || "").trim();

  if (!name) return { error: "ERR_nameRequired", id: null, link: null };
  if (!adminName) return { error: "ERR_adminNameRequired", id: null, link: null };
  if (!EMAIL_RE.test(adminEmail))
    return { error: "ERR_emailInvalid", id: null, link: null };

  let slug: string;
  if (rawSlug) {
    if (!SLUG_RE.test(rawSlug)) return { error: "ERR_slugInvalid", id: null, link: null };
    const { data: exists } = await admin
      .from("schools")
      .select("id")
      .eq("slug", rawSlug)
      .maybeSingle();
    if (exists) return { error: "ERR_slugTaken", id: null, link: null };
    slug = rawSlug;
  } else {
    const base = slugify(name);
    if (!base) return { error: "ERR_slugInvalid", id: null, link: null };
    slug = await uniqueSlug(admin, base);
  }

  const { data: schoolId, error: rpcErr } = await admin.rpc("provision_school", {
    p_name: name,
    p_slug: slug,
  });
  if (rpcErr) return { error: rpcErr.message, id: null, link: null };

  const inv = await inviteAdmin(admin, schoolId as string, slug, adminEmail, adminName);
  if (inv.error) return { error: inv.error, id: (schoolId as string) ?? null, link: null };

  revalidatePath("/[locale]/schools", "page");
  return { error: null, id: (schoolId as string) ?? null, link: inv.link };
}

export async function setSchoolActive(id: string, isActive: boolean): Promise<{
  error: string | null;
}> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { error };

  const { error: uErr } = await admin
    .from("schools")
    .update({ is_active: isActive })
    .eq("id", id);

  revalidatePath("/[locale]/schools", "page");
  return { error: uErr?.message ?? null };
}

// Ajoute un admin supplémentaire à une école et renvoie un lien d'invitation.
export async function createSchoolAdmin(formData: FormData): Promise<{
  error: string | null;
  link: string | null;
}> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { error, link: null };

  const schoolId = ((formData.get("school_id") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const full_name = ((formData.get("full_name") as string) || "").trim();
  if (!schoolId) return { error: "ERR_schoolRequired", link: null };
  if (!full_name) return { error: "ERR_adminNameRequired", link: null };
  if (!EMAIL_RE.test(email)) return { error: "ERR_emailInvalid", link: null };

  // Récupère le slug de l'école pour construire le lien vers son sous-domaine.
  const { data: school } = await admin
    .from("schools")
    .select("slug")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return { error: "ERR_schoolRequired", link: null };

  const inv = await inviteAdmin(admin, schoolId, school.slug, email, full_name);
  if (inv.error) return { error: inv.error, link: null };

  revalidatePath("/[locale]/schools", "page");
  return { error: null, link: inv.link };
}

// Modifie le nom et l'e-mail d'un admin existant.
export async function updateSchoolAdmin(formData: FormData): Promise<{
  error: string | null;
}> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { error };

  const adminId = ((formData.get("admin_id") as string) || "").trim();
  const full_name = ((formData.get("full_name") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  if (!adminId) return { error: "ERR_adminRequired" };
  if (!full_name) return { error: "ERR_adminNameRequired" };
  if (!EMAIL_RE.test(email)) return { error: "ERR_emailInvalid" };

  const { error: uErr } = await admin.auth.admin.updateUserById(adminId, {
    email,
    user_metadata: { full_name },
  });
  if (uErr) return { error: uErr.message };

  const { error: pErr } = await admin
    .from("profiles")
    .update({ full_name })
    .eq("id", adminId);
  if (pErr) return { error: pErr.message };

  revalidatePath("/[locale]/schools", "page");
  return { error: null };
}

// Modifie le nom d'une école (le slug/sous-domaine reste stable).
export async function updateSchoolName(
  id: string,
  name: string,
): Promise<{ error: string | null }> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { error };

  const trimmed = name.trim();
  if (!trimmed) return { error: "ERR_nameRequired" };

  const { error: uErr } = await admin
    .from("schools")
    .update({ name: trimmed })
    .eq("id", id);
  if (uErr) return { error: uErr.message };

  revalidatePath("/[locale]/schools", "page");
  return { error: null };
}

// Supprime DÉFINITIVEMENT une école : ses données (cascade sur années,
// classes, élèves, paiements…) ET tous les comptes qui lui sont rattachés.
export async function deleteSchool(
  id: string,
): Promise<{ error: string | null }> {
  const { admin, error } = await requireSuperAdmin();
  if (!admin) return { error };

  // 1) Comptes rattachés à l'école (admins, enseignants, parents).
  const { data: members } = await admin
    .from("profiles")
    .select("id")
    .eq("school_id", id);

  // 2) Suppression des comptes auth (supprime aussi leur profil en cascade).
  //    On ne touche jamais au super-admin (school_id NULL, non listé ici).
  for (const m of members ?? []) {
    await admin.auth.admin.deleteUser(m.id);
  }

  // 3) Suppression de l'école (cascade sur les tables rattachées).
  const { error: dErr } = await admin.from("schools").delete().eq("id", id);
  if (dErr) return { error: dErr.message };

  revalidatePath("/[locale]/schools", "page");
  return { error: null };
}
