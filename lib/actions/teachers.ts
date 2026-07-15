"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveTeacher(formData: FormData) {
  const supabase = await createClient();

  const id = formData.get("id") as string | null;
  const payload = {
    first_name: (formData.get("first_name") as string).trim(),
    last_name: (formData.get("last_name") as string).trim(),
    phone: (formData.get("phone") as string) || null,
    email: (formData.get("email") as string) || null,
    specialty: (formData.get("specialty") as string) || null,
    base_salary: Number(formData.get("base_salary") || 0),
    hire_date: (formData.get("hire_date") as string) || null,
    is_active: formData.get("is_active") === "true",
  };

  const { error } = id
    ? await supabase.from("teachers").update(payload).eq("id", id)
    : await supabase.from("teachers").insert(payload);

  revalidatePath("/[locale]/teachers", "page");
  return { error: error?.message ?? null };
}

export async function deleteTeacher(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("teachers").delete().eq("id", id);
  revalidatePath("/[locale]/teachers", "page");
  return { error: error?.message ?? null };
}
