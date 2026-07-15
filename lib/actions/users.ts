"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSessionProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";

type Role = "admin" | "teacher" | "parent";

export type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
};

// Renvoie l'école de l'admin courant, ou null s'il n'est pas admin.
async function adminSchool(): Promise<string | null> {
  const { role, schoolId } = await getSessionProfile();
  return role === "admin" ? schoolId : null;
}

async function getOrigin() {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function listAppUsers(): Promise<{
  users: AppUser[];
  error: string | null;
}> {
  const schoolId = await adminSchool();
  if (!schoolId) return { users: [], error: "unauthorized" };
  const admin = createAdminClient();
  if (!admin) return { users: [], error: "missing_service_key" };

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) return { users: [], error: error.message };

  // On ne liste QUE les profils de l'école de l'admin (isolation inter-écoles).
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("school_id", schoolId);

  const byId = new Map(
    (profiles ?? []).map((p) => [p.id, p as { full_name: string; role: Role }])
  );

  const users: AppUser[] = data.users
    .filter((u) => byId.has(u.id)) // exclut les comptes d'autres écoles
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name:
          p?.full_name || (u.user_metadata?.full_name as string) || "",
        role: (p?.role ?? (u.user_metadata?.role as Role) ?? "parent") as Role,
        created_at: u.created_at,
      };
    });

  users.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { users, error: null };
}

// Crée le compte et renvoie un lien d'invitation à partager. La personne
// ouvre le lien et définit elle-même son mot de passe (page /set-password).
export async function createAppUser(formData: FormData): Promise<{
  error: string | null;
  link: string | null;
}> {
  const schoolId = await adminSchool();
  if (!schoolId) return { error: "unauthorized", link: null };
  const admin = createAdminClient();
  if (!admin) return { error: "missing_service_key", link: null };

  const email = (formData.get("email") as string).trim();
  const full_name = (formData.get("full_name") as string).trim();
  const role = (formData.get("role") as Role) || "parent";
  const phone = ((formData.get("phone") as string) || "").trim();

  const origin = await getOrigin();
  const redirectTo = `${origin}/fr/set-password`;

  // school_id transmis dans les métadonnées : le trigger handle_new_user
  // rattache automatiquement le nouveau compte à l'école de l'admin.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name, role, school_id: schoolId }, redirectTo },
  });
  if (error) return { error: error.message, link: null };

  const userId = data?.user?.id;
  if (userId) {
    await admin
      .from("profiles")
      .update({ full_name, role, phone: phone || null, school_id: schoolId })
      .eq("id", userId);
  }

  revalidatePath("/[locale]/users", "page");
  return { error: null, link: data?.properties?.action_link ?? null };
}

export async function updateAppUserRole(id: string, role: Role) {
  const schoolId = await adminSchool();
  if (!schoolId) return { error: "unauthorized" };
  const admin = createAdminClient();
  if (!admin) return { error: "missing_service_key" };

  // Défense : on ne modifie que les comptes de sa propre école.
  const { data: target } = await admin
    .from("profiles")
    .select("school_id")
    .eq("id", id)
    .single();
  if (!target || target.school_id !== schoolId) {
    return { error: "unauthorized" };
  }

  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", id);
  if (!error) {
    await admin.auth.admin.updateUserById(id, { user_metadata: { role } });
  }

  revalidatePath("/[locale]/users", "page");
  return { error: error?.message ?? null };
}
