"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dues";

export async function savePayment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const id = formData.get("id") as string | null;
  const amount = Number(formData.get("amount"));
  const studentId = formData.get("student_id") as string;
  if (!studentId) return { error: "ERR_studentRequired", id: null };
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "ERR_amountInvalid", id: null };

  const type = (formData.get("type") as string) || "tuition";
  const period = (formData.get("period") as string) || null;
  const payload = {
    student_id: studentId,
    amount,
    type,
    method: (formData.get("method") as string) || "cash",
    period,
    paid_at: formData.get("paid_at") as string,
    notes: (formData.get("notes") as string) || null,
    ...(id ? {} : { recorded_by: session?.user.id ?? null }),
  };

  const { data, error } = id
    ? await supabase.from("payments").update(payload).eq("id", id).select("id").single()
    : await supabase.from("payments").insert(payload).select("id").single();

  // Fige le tarif du mois réglé : si le tarif de la classe change plus tard,
  // ce mois garde le montant en vigueur au moment du paiement.
  if (!error && type === "tuition" && period) {
    await freezeMonths(studentId, [period]);
  }

  revalidatePath("/[locale]/payments", "page");
  revalidatePath("/[locale]/dashboard", "page");
  return { error: error?.message ?? null, id: (data?.id as string) ?? id };
}

// Enregistre dans monthly_dues le tarif courant de la classe de l'élève pour
// les périodes données, sans écraser un montant déjà figé.
async function freezeMonths(studentId: string, periods: string[], fee?: number) {
  const supabase = await createClient();
  const { data: st } = await supabase
    .from("students")
    .select("class_id, classes(monthly_fee)")
    .eq("id", studentId)
    .maybeSingle();
  if (!st) return;
  const cls = st.classes as unknown as { monthly_fee: number } | null;
  const amount = fee ?? Number(cls?.monthly_fee ?? 0);
  if (amount <= 0) return;
  await supabase.from("monthly_dues").upsert(
    periods.map((period) => ({
      student_id: studentId,
      class_id: st.class_id,
      period,
      amount,
    })),
    { onConflict: "student_id,period", ignoreDuplicates: true }
  );
}

// Appelé quand l'admin change le tarif d'une classe : les mois déjà écoulés
// (jusqu'au mois courant inclus) gardent l'ANCIEN tarif pour chaque élève.
export async function freezeClassPastMonths(
  classId: string,
  oldFee: number,
  fromPeriod: string,
  toPeriod: string
) {
  if (oldFee <= 0) return;
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, enrollment_date")
    .eq("class_id", classId);
  const periods = monthRange(fromPeriod, toPeriod);
  const rows = (students ?? []).flatMap((s) => {
    const start = (s.enrollment_date as string | null)?.slice(0, 7) ?? fromPeriod;
    return periods
      .filter((p) => p >= start)
      .map((period) => ({
        student_id: s.id as string,
        class_id: classId,
        period,
        amount: oldFee,
      }));
  });
  if (rows.length === 0) return;
  await supabase
    .from("monthly_dues")
    .upsert(rows, { onConflict: "student_id,period", ignoreDuplicates: true });
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
