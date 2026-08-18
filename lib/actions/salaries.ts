"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/supabase/profile";

// Salaires des enseignants. Saisie réservée à l'administration ; l'enseignant
// ne fait que consulter et imprimer les siens (page « Mes paiements »).

export async function saveSalary(formData: FormData) {
  const { supabase, userId, role } = await getSessionProfile();
  if (role !== "admin") return { error: "ERR_unauthorized" };

  const id = (formData.get("id") as string) || null;
  const payload = {
    teacher_id: formData.get("teacher_id") as string,
    amount: Number(formData.get("amount")),
    period: formData.get("period") as string,
    method: formData.get("method") as string,
    paid_at: formData.get("paid_at") as string,
    notes: (formData.get("notes") as string) || null,
    ...(id ? {} : { recorded_by: userId }),
  };

  const { error } = id
    ? await supabase.from("salary_payments").update(payload).eq("id", id)
    : await supabase.from("salary_payments").insert(payload);

  revalidatePath("/[locale]/finance", "page");
  revalidatePath("/[locale]/salaries", "page");
  return { error: error?.message ?? null };
}

export async function deleteSalary(id: string) {
  const { supabase, role } = await getSessionProfile();
  if (role !== "admin") return { error: "ERR_unauthorized" };

  const { error } = await supabase
    .from("salary_payments")
    .delete()
    .eq("id", id);

  revalidatePath("/[locale]/finance", "page");
  revalidatePath("/[locale]/salaries", "page");
  return { error: error?.message ?? null };
}
