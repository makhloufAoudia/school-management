"use server";

import { revalidatePath } from "next/cache";
import { siteOrigin } from "@/lib/site-url";
import { getSessionProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Comptes de connexion rattachés à une fiche
// ------------------------------------------------------------
// - Enseignant : crée un compte "teacher" et le lie à teachers.profile_id.
//   L'enseignant voit alors ses cours, ses élèves, ses notes et ses salaires.
// - Élève : le compte de l'élève est celui de son parent / tuteur
//   (rôle "parent"), lié à students.guardian_id. Il donne accès aux notes,
//   absences, paiements et supports de cours de CET élève uniquement.
//
// Dans les deux cas on ne demande pas de mot de passe : on génère un lien
// d'invitation à partager (WhatsApp, SMS…), la personne choisit son mot de
// passe sur /set-password. Même principe que la page Utilisateurs.
// ============================================================

export type AccountResult = {
  error: string | null;
  link: string | null;
  // true quand un compte existait déjà avec cet e-mail : on l'a simplement
  // rattaché à la fiche (pas de nouveau lien d'invitation).
  linked: boolean;
};

type Role = "teacher" | "parent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(error: string): AccountResult {
  return { error, link: null, linked: false };
}

// École de l'admin connecté, ou null s'il n'est pas admin.
async function adminSchool(): Promise<string | null> {
  const { role, schoolId } = await getSessionProfile();
  return role === "admin" ? schoolId : null;
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

// Crée le compte (ou récupère celui qui existe déjà avec cet e-mail) et
// renvoie son id + le lien d'invitation éventuel.
async function createOrFindUser(
  admin: AdminClient,
  params: {
    email: string;
    fullName: string;
    phone: string;
    role: Role;
    schoolId: string;
  }
): Promise<{ error: string | null; userId: string | null; link: string | null; linked: boolean }> {
  const { email, fullName, phone, role, schoolId } = params;
  const origin = await siteOrigin();
  const redirectTo = `${origin}/fr/set-password`;

  // school_id passé dans les métadonnées : le trigger handle_new_user
  // rattache le nouveau profil à l'école de l'admin.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { full_name: fullName, role, school_id: schoolId },
      redirectTo,
    },
  });

  if (!error && data?.user?.id) {
    await admin
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        phone: phone || null,
        school_id: schoolId,
      })
      .eq("id", data.user.id);

    return {
      error: null,
      userId: data.user.id,
      link: data.properties?.action_link ?? null,
      linked: false,
    };
  }

  // E-mail déjà utilisé : on rattache le compte existant s'il appartient à
  // la même école (cas fréquent : un parent qui a déjà un autre enfant).
  if (error && /already|exist|registered/i.test(error.message)) {
    const { data: list } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existing = list?.users.find(
      (u) => (u.email ?? "").toLowerCase() === email
    );
    if (!existing) return { error: "ERR_email_taken", userId: null, link: null, linked: false };

    const { data: profile } = await admin
      .from("profiles")
      .select("school_id")
      .eq("id", existing.id)
      .maybeSingle();

    if (profile && profile.school_id && profile.school_id !== schoolId) {
      // Compte d'une autre école : on n'y touche pas.
      return { error: "ERR_email_taken", userId: null, link: null, linked: false };
    }

    await admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        school_id: schoolId,
      })
      .eq("id", existing.id);

    return { error: null, userId: existing.id, link: null, linked: true };
  }

  return { error: error?.message ?? "ERR_unknown", userId: null, link: null, linked: false };
}

// ---------- Enseignant ----------
export async function createTeacherAccount(
  formData: FormData
): Promise<AccountResult> {
  const schoolId = await adminSchool();
  if (!schoolId) return fail("ERR_unauthorized");
  const admin = createAdminClient();
  if (!admin) return fail("ERR_missing_service_key");

  const teacherId = ((formData.get("teacher_id") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const fullName = ((formData.get("full_name") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();

  if (!teacherId) return fail("ERR_not_found");
  if (!EMAIL_RE.test(email)) return fail("ERR_email_invalid");
  if (!fullName) return fail("ERR_name_required");

  const { data: teacher } = await admin
    .from("teachers")
    .select("id, school_id, profile_id")
    .eq("id", teacherId)
    .maybeSingle();

  if (!teacher || teacher.school_id !== schoolId) return fail("ERR_not_found");
  if (teacher.profile_id) return fail("ERR_account_exists");

  const res = await createOrFindUser(admin, {
    email,
    fullName,
    phone,
    role: "teacher",
    schoolId,
  });
  if (res.error || !res.userId) return fail(res.error ?? "ERR_unknown");

  // Le compte récupéré ne doit pas déjà servir à un autre enseignant.
  const { data: taken } = await admin
    .from("teachers")
    .select("id")
    .eq("profile_id", res.userId)
    .maybeSingle();
  if (taken) return fail("ERR_email_taken");

  // On ne rétrograde jamais un administrateur en enseignant.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", res.userId)
    .maybeSingle();
  if (profile?.role === "admin") return fail("ERR_email_is_admin");

  // Rôle enseignant + rattachement de la fiche.
  await admin.from("profiles").update({ role: "teacher" }).eq("id", res.userId);
  await admin.auth.admin.updateUserById(res.userId, {
    user_metadata: { full_name: fullName, role: "teacher", school_id: schoolId },
  });

  const { error: linkErr } = await admin
    .from("teachers")
    .update({ profile_id: res.userId, email, phone: phone || null })
    .eq("id", teacherId);
  if (linkErr) return fail(linkErr.message);

  revalidatePath("/[locale]/teachers", "page");
  return { error: null, link: res.link, linked: res.linked };
}

// ---------- Élève (compte du parent / tuteur) ----------
export async function createGuardianAccount(
  formData: FormData
): Promise<AccountResult> {
  const schoolId = await adminSchool();
  if (!schoolId) return fail("ERR_unauthorized");
  const admin = createAdminClient();
  if (!admin) return fail("ERR_missing_service_key");

  const studentId = ((formData.get("student_id") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const fullName = ((formData.get("full_name") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();

  if (!studentId) return fail("ERR_not_found");
  if (!EMAIL_RE.test(email)) return fail("ERR_email_invalid");
  if (!fullName) return fail("ERR_name_required");

  const { data: student } = await admin
    .from("students")
    .select("id, school_id, guardian_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!student || student.school_id !== schoolId) return fail("ERR_not_found");
  if (student.guardian_id) return fail("ERR_account_exists");

  const res = await createOrFindUser(admin, {
    email,
    fullName,
    phone,
    role: "parent",
    schoolId,
  });
  if (res.error || !res.userId) return fail(res.error ?? "ERR_unknown");

  // On ne rétrograde jamais un admin ou un enseignant en parent : un même
  // compte peut suivre plusieurs élèves, son rôle reste celui d'origine.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", res.userId)
    .maybeSingle();

  if (!profile?.role || profile.role === "parent") {
    await admin.from("profiles").update({ role: "parent" }).eq("id", res.userId);
    await admin.auth.admin.updateUserById(res.userId, {
      user_metadata: { full_name: fullName, role: "parent", school_id: schoolId },
    });
  }

  const { error: linkErr } = await admin
    .from("students")
    .update({ guardian_id: res.userId })
    .eq("id", studentId);
  if (linkErr) return fail(linkErr.message);

  revalidatePath("/[locale]/students", "page");
  return { error: null, link: res.link, linked: res.linked };
}

// ---------- Détacher un compte d'une fiche ----------
export async function unlinkTeacherAccount(teacherId: string) {
  const schoolId = await adminSchool();
  if (!schoolId) return { error: "ERR_unauthorized" };
  const admin = createAdminClient();
  if (!admin) return { error: "ERR_missing_service_key" };

  const { data: teacher } = await admin
    .from("teachers")
    .select("id, school_id")
    .eq("id", teacherId)
    .maybeSingle();
  if (!teacher || teacher.school_id !== schoolId) return { error: "ERR_not_found" };

  const { error } = await admin
    .from("teachers")
    .update({ profile_id: null })
    .eq("id", teacherId);

  revalidatePath("/[locale]/teachers", "page");
  return { error: error?.message ?? null };
}

export async function unlinkGuardianAccount(studentId: string) {
  const schoolId = await adminSchool();
  if (!schoolId) return { error: "ERR_unauthorized" };
  const admin = createAdminClient();
  if (!admin) return { error: "ERR_missing_service_key" };

  const { data: student } = await admin
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || student.school_id !== schoolId) return { error: "ERR_not_found" };

  const { error } = await admin
    .from("students")
    .update({ guardian_id: null })
    .eq("id", studentId);

  revalidatePath("/[locale]/students", "page");
  return { error: error?.message ?? null };
}
