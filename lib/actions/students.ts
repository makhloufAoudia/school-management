"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveStudent(formData: FormData) {
  const supabase = await createClient();

  const id = formData.get("id") as string | null;
  const payload = {
    first_name: (formData.get("first_name") as string).trim(),
    last_name: (formData.get("last_name") as string).trim(),
    gender: (formData.get("gender") as string) || null,
    birth_date: (formData.get("birth_date") as string) || null,
    class_id: (formData.get("class_id") as string) || null,
    status: (formData.get("status") as string) || "active",
    notes: (formData.get("notes") as string) || null,
  };

  const { error } = id
    ? await supabase.from("students").update(payload).eq("id", id)
    : await supabase.from("students").insert(payload);

  revalidatePath("/[locale]/students", "page");
  return { error: error?.message ?? null };
}

export async function deleteStudent(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("students").delete().eq("id", id);
  revalidatePath("/[locale]/students", "page");
  return { error: error?.message ?? null };
}
