"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/supabase/profile";

export type PublicSchool = { id: string; name: string; is_active: boolean };

// Infos publiques minimales d'une école (nom, statut) à partir de son slug.
// Sert à afficher la marque sur la page de connexion du sous-domaine.
export async function getSchoolBySlug(
  slug: string,
): Promise<PublicSchool | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("schools")
    .select("id, name, is_active")
    .eq("slug", slug)
    .maybeSingle();
  return (data as PublicSchool) ?? null;
}

// Vérifie que l'utilisateur connecté appartient bien à l'école du slug.
// Utilisé juste après la connexion sur un sous-domaine d'école.
export async function assertSchoolMember(slug: string): Promise<{
  ok: boolean;
  reason: "ok" | "not_member" | "inactive" | "no_school";
}> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "no_school" };

  const { data: school } = await admin
    .from("schools")
    .select("id, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (!school) return { ok: false, reason: "no_school" };
  if (!school.is_active) return { ok: false, reason: "inactive" };

  const { userId, schoolId } = await getSessionProfile();
  if (!userId || schoolId !== school.id) {
    return { ok: false, reason: "not_member" };
  }
  return { ok: true, reason: "ok" };
}

// Accès à l'espace plateforme (apex) : réservé au super-administrateur.
export async function assertPlatformAccess(): Promise<{ ok: boolean }> {
  const { userId, isSuperAdmin } = await getSessionProfile();
  return { ok: Boolean(userId && isSuperAdmin) };
}

// Accès en mode "domaine unique" (sans sous-domaine par école) : autorise tout
// utilisateur ayant un profil valide. Le super-admin passe toujours ; un membre
// d'école passe si son école est active. La RLS garantit ensuite que chacun ne
// voit que les données de son école.
export async function assertAnyAccess(): Promise<{
  ok: boolean;
  reason: "ok" | "not_authenticated" | "no_school" | "inactive";
}> {
  const { userId, schoolId, isSuperAdmin } = await getSessionProfile();
  if (!userId) return { ok: false, reason: "not_authenticated" };
  if (isSuperAdmin) return { ok: true, reason: "ok" };
  if (!schoolId) return { ok: false, reason: "no_school" };

  const admin = createAdminClient();
  if (admin) {
    const { data: school } = await admin
      .from("schools")
      .select("is_active")
      .eq("id", schoolId)
      .maybeSingle();
    if (!school || !school.is_active) return { ok: false, reason: "inactive" };
  }
  return { ok: true, reason: "ok" };
}
