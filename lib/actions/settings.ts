"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ---------- École ----------
// Renomme sa propre école. La RLS "admin update own school" garantit
// qu'un admin ne peut modifier que l'école à laquelle il appartient.
export async function updateSchool(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string).trim();
  if (!name) return { error: "ERR_nameRequired" };

  const { error } = await supabase
    .from("schools")
    .update({ name })
    .eq("id", id);
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}

// ---------- Années scolaires ----------
export async function saveYear(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const payload = {
    label: (formData.get("label") as string).trim(),
    start_date: formData.get("start_date") as string,
    end_date: formData.get("end_date") as string,
  };
  const { error } = id
    ? await supabase.from("academic_years").update(payload).eq("id", id)
    : await supabase.from("academic_years").insert(payload);
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}

export async function setCurrentYear(id: string) {
  const supabase = await createClient();
  await supabase
    .from("academic_years")
    .update({ is_current: false })
    .eq("is_current", true);
  const { error } = await supabase
    .from("academic_years")
    .update({ is_current: true })
    .eq("id", id);
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}

export async function updateYearsOrder(ids: string[]) {
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i++) {
    await supabase
      .from("academic_years")
      .update({ sort_order: i })
      .eq("id", ids[i]);
  }
  revalidatePath("/[locale]/settings", "page");
  return { error: null };
}

export async function deleteYear(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("academic_years").delete().eq("id", id);
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}

// ---------- Matières ----------
export async function saveSubject(formData: FormData) {
  const supabase = await createClient();
  const id = formData.get("id") as string | null;
  const name = (formData.get("name") as string).trim();
  const { error } = id
    ? await supabase.from("subjects").update({ name }).eq("id", id)
    : await supabase.from("subjects").insert({ name });
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}

export async function deleteSubject(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}

// ---------- Profil ----------
export async function updateProfileName(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Nom et téléphone du compte connecté. L'e-mail n'est pas modifiable ici :
  // c'est l'identifiant de connexion, il se change côté administration.
  const full_name = ((formData.get("full_name") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, phone: phone || null })
    .eq("id", user.id);
  revalidatePath("/[locale]/settings", "page");
  return { error: error?.message ?? null };
}
