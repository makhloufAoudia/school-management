"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function savePayment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const id = formData.get("id") as string | null;
  const payload = {
    student_id: formData.get("student_id") as string,
    amount: Number(formData.get("amount")),
    type: formData.get("type") as string,
    method: formData.get("method") as string,
    period: (formData.get("period") as string) || null,
    paid_at: formData.get("paid_at") as string,
    notes: (formData.get("notes") as string) || null,
    ...(id ? {} : { recorded_by: session?.user.id ?? null }),
  };

  const { error } = id
    ? await supabase.from("payments").update(payload).eq("id", id)
    : await supabase.from("payments").insert(payload);

  revalidatePath("/[locale]/payments", "page");
  return { error: error?.message ?? null };
}

export async function saveClassDue(formData: FormData) {
  const supabase = await createClient();

  const classId = formData.get("class_id") as string;
  const base = {
    label: (formData.get("label") as string).trim(),
    amount: Number(formData.get("amount")),
    period: formData.get("period") as string,
  };

  let error = null;
  if (classId === "all") {
    const { data: classes } = await supabase.from("classes").select("id");
    if (classes && classes.length > 0) {
      const rows = classes.map((c) => ({ ...base, class_id: c.id }));
      ({ error } = await supabase.from("class_dues").insert(rows));
    }
  } else {
    ({ error } = await supabase
      .from("class_dues")
      .insert({ ...base, class_id: classId }));
  }

  revalidatePath("/[locale]/payments", "page");
  return { error: error?.message ?? null };
}

export async function deleteClassDue(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("class_dues").delete().eq("id", id);
  revalidatePath("/[locale]/payments", "page");
  return { error: error?.message ?? null };
}

export async function deletePayment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", id);
  revalidatePath("/[locale]/payments", "page");
  return { error: error?.message ?? null };
}

// ---------- Génération automatique des échéances mensuelles ----------
// Crée, pour la période donnée, une échéance par élève actif dont la classe
// a un tarif mensuel > 0. Le montant est figé (copie du monthly_fee courant).
// Les élèves déjà générés pour cette période sont ignorés (idempotent).
export async function generateMonthlyDues(period: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!period) return { error: "ERR_periodRequired", created: 0 };

  // Élèves actifs + tarif de leur classe.
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, class_id, classes(monthly_fee)")
    .eq("status", "active");

  if (studentsError) return { error: studentsError.message, created: 0 };

  // Échéances déjà présentes pour la période (pour ne pas les écraser).
  const { data: existing } = await supabase
    .from("monthly_dues")
    .select("student_id")
    .eq("period", period);
  const already = new Set((existing ?? []).map((d) => d.student_id));

  const rows = (students ?? [])
    .map((s) => {
      const cls = s.classes as unknown as { monthly_fee: number } | null;
      const fee = Number(cls?.monthly_fee ?? 0);
      return { student: s, fee };
    })
    .filter(({ student, fee }) => fee > 0 && !already.has(student.id))
    .map(({ student, fee }) => ({
      student_id: student.id,
      class_id: student.class_id,
      period,
      amount: fee,
      created_by: session?.user.id ?? null,
    }));

  if (rows.length === 0) {
    revalidatePath("/[locale]/payments", "page");
    return { error: null, created: 0 };
  }

  const { error } = await supabase.from("monthly_dues").insert(rows);
  revalidatePath("/[locale]/payments", "page");
  return { error: error?.message ?? null, created: error ? 0 : rows.length };
}
