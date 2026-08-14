"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveClass(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const id = formData.get("id") as string | null;
  const name = (formData.get("name") as string).trim();
  const level = (formData.get("level") as string).trim();
  const capacity = Number(formData.get("capacity") || 30);
  const monthly_fee = Number(formData.get("monthly_fee") || 0);
  const extra_fee = Number(formData.get("extra_fee") || 0);

  // --- Validation serveur (les clés ERR_* sont traduites côté client) ---
  if (!name) return { error: "ERR_nameRequired" };
  if (!level) return { error: "ERR_levelRequired" };
  if (!Number.isFinite(monthly_fee) || monthly_fee <= 0)
    return { error: "ERR_feeRequired" };
  if (!Number.isFinite(extra_fee) || extra_fee < 0)
    return { error: "ERR_feeInvalid" };

  const head = ((formData.get("head_teacher_id") as string) || "").trim();

  const payload = {
    name,
    level,
    // Professeur principal : facultatif, vide = aucun.
    head_teacher_id: head || null,
    capacity: capacity >= 1 ? capacity : 30,
    monthly_fee,
    extra_fee,
    academic_year_id: formData.get("academic_year_id") as string,
  };

  let error = null;
  if (id) {
    // Récupère l'ancien tarif pour tracer un éventuel changement.
    const { data: prev } = await supabase
      .from("classes")
      .select("monthly_fee")
      .eq("id", id)
      .single();

    ({ error } = await supabase.from("classes").update(payload).eq("id", id));

    if (!error && prev && Number(prev.monthly_fee) !== monthly_fee) {
      await supabase.from("class_fee_history").insert({
        class_id: id,
        old_fee: Number(prev.monthly_fee),
        new_fee: monthly_fee,
        changed_by: session?.user.id ?? null,
      });
    }
  } else {
    ({ error } = await supabase.from("classes").insert(payload));
  }

  revalidatePath("/[locale]/classes", "page");
  return { error: error?.message ?? null };
}

export async function saveClassExtraFee(id: string, extraFee: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update({ extra_fee: extraFee })
    .eq("id", id);

  revalidatePath("/[locale]/classes", "page");
  revalidatePath("/[locale]/payments", "page");
  return { error: error?.message ?? null };
}

export async function deleteClass(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("classes").delete().eq("id", id);
  revalidatePath("/[locale]/classes", "page");
  return { error: error?.message ?? null };
}
