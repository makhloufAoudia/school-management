"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";

// ============================================================
// Demandes de modification de l'emploi du temps
// ------------------------------------------------------------
// L'enseignant ne modifie pas les cours directement : il dépose une
// demande. L'administration l'accepte — le changement est alors appliqué
// au cours — ou la refuse, en expliquant pourquoi.
// La sécurité repose sur la RLS (voir 2026-08-droits-enseignant.sql) :
// ces actions utilisent le client normal, pas la clé service_role.
// ============================================================

export type RequestKind = "create" | "update" | "delete";

function optional(formData: FormData, key: string): string | null {
  const v = ((formData.get(key) as string) || "").trim();
  return v === "" ? null : v;
}

// ---------- Enseignant : déposer une demande ----------
export async function createScheduleRequest(formData: FormData) {
  const { supabase, userId, role, schoolId } = await getSessionProfile();
  if (!userId) return { error: "ERR_unauthorized" };
  if (role !== "teacher") return { error: "ERR_unauthorized" };

  const kind = ((formData.get("kind") as string) || "update") as RequestKind;
  const courseId = optional(formData, "course_id");

  // Modifier ou supprimer suppose un cours existant.
  if (kind !== "create" && !courseId) return { error: "ERR_course_required" };
  if (kind === "create" && (!optional(formData, "class_id") || !optional(formData, "subject_id"))) {
    return { error: "ERR_class_subject_required" };
  }

  const day = optional(formData, "day_of_week");

  const { error } = await supabase.from("schedule_requests").insert({
    school_id: schoolId,
    course_id: courseId,
    requested_by: userId,
    kind,
    class_id: optional(formData, "class_id"),
    subject_id: optional(formData, "subject_id"),
    day_of_week: day === null ? null : Number(day),
    start_time: optional(formData, "start_time"),
    end_time: optional(formData, "end_time"),
    room: optional(formData, "room"),
    note: optional(formData, "note"),
    status: "pending",
  });

  revalidatePath("/[locale]/schedule", "page");
  return { error: error?.message ?? null };
}

// ---------- Administration : accepter ----------
// L'acceptation applique réellement la demande au cours concerné.
export async function approveScheduleRequest(id: string) {
  const { role } = await getSessionProfile();
  if (role !== "admin") return { error: "ERR_unauthorized" };
  const supabase = await createClient();

  const { data: req, error: readErr } = await supabase
    .from("schedule_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (readErr || !req) return { error: readErr?.message ?? "ERR_not_found" };
  if (req.status !== "pending") return { error: "ERR_already_decided" };

  // Champs à écrire : uniquement ceux que l'enseignant a renseignés.
  const patch: Record<string, unknown> = {};
  for (const k of [
    "class_id",
    "subject_id",
    "teacher_id",
    "day_of_week",
    "start_time",
    "end_time",
    "room",
  ] as const) {
    if (req[k] !== null && req[k] !== undefined) patch[k] = req[k];
  }

  let applyErr: string | null = null;

  if (req.kind === "delete" && req.course_id) {
    const { error } = await supabase
      .from("courses")
      .delete()
      .eq("id", req.course_id);
    applyErr = error?.message ?? null;
  } else if (req.kind === "create") {
    const { error } = await supabase.from("courses").insert(patch);
    applyErr = error?.message ?? null;
  } else if (req.course_id && Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("courses")
      .update(patch)
      .eq("id", req.course_id);
    applyErr = error?.message ?? null;
  }

  if (applyErr) return { error: applyErr };

  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("schedule_requests")
    .update({
      status: "approved",
      decided_by: me.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/[locale]/schedule", "page");
  revalidatePath("/[locale]/courses", "page");
  return { error: error?.message ?? null };
}

// ---------- Administration : refuser ----------
export async function rejectScheduleRequest(id: string, adminNote: string) {
  const { role } = await getSessionProfile();
  if (role !== "admin") return { error: "ERR_unauthorized" };
  const supabase = await createClient();

  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("schedule_requests")
    .update({
      status: "rejected",
      admin_note: adminNote.trim() || null,
      decided_by: me.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  revalidatePath("/[locale]/schedule", "page");
  return { error: error?.message ?? null };
}
