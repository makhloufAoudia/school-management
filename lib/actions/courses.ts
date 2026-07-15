"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  uploadToDrive,
  deleteFromDrive,
  isDriveConfigured,
  createResumableUploadSession,
  makeFilePublic,
} from "@/lib/google-drive";
import { getSchoolFolderId } from "@/lib/school-drive";
import { getSessionProfile } from "@/lib/supabase/profile";

export async function saveCourse(formData: FormData) {
  const supabase = await createClient();

  const id = formData.get("id") as string | null;
  const payload = {
    class_id: formData.get("class_id") as string,
    subject_id: formData.get("subject_id") as string,
    teacher_id: (formData.get("teacher_id") as string) || null,
    day_of_week: Number(formData.get("day_of_week")),
    start_time: (formData.get("start_time") as string) || null,
    end_time: (formData.get("end_time") as string) || null,
    room: (formData.get("room") as string) || null,
  };

  if (id) {
    const { error } = await supabase.from("courses").update(payload).eq("id", id);
    revalidatePath("/[locale]/courses", "page");
    return { error: error?.message ?? null, id };
  }

  const { data, error } = await supabase
    .from("courses")
    .insert(payload)
    .select("id")
    .single();

  revalidatePath("/[locale]/courses", "page");
  return { error: error?.message ?? null, id: data?.id ?? null };
}

export async function deleteCourse(id: string) {
  const supabase = await createClient();

  // Supprimer d'abord les fichiers Drive associés
  const { data: materials } = await supabase
    .from("course_materials")
    .select("drive_file_id")
    .eq("course_id", id);

  if (materials && isDriveConfigured()) {
    for (const m of materials) {
      try {
        await deleteFromDrive(m.drive_file_id);
      } catch {
        // fichier déjà supprimé côté Drive : on continue
      }
    }
  }

  const { error } = await supabase.from("courses").delete().eq("id", id);
  revalidatePath("/[locale]/courses", "page");
  return { error: error?.message ?? null };
}

export async function uploadMaterial(formData: FormData) {
  if (!isDriveConfigured()) {
    return { error: "GOOGLE_DRIVE_NOT_CONFIGURED" };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const courseId = formData.get("course_id") as string;
  const title = ((formData.get("title") as string) || "").trim();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) return { error: "NO_FILE" };
  if (file.type !== "application/pdf") return { error: "NOT_PDF" };
  if (file.size > 15 * 1024 * 1024) return { error: "TOO_LARGE" };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Sous-dossier Drive propre à l'école de l'utilisateur (isolation des PDF).
    const { schoolId } = await getSessionProfile();
    const folderId = await getSchoolFolderId(schoolId).catch(() => undefined);
    const driveId = await uploadToDrive(
      title || file.name,
      "application/pdf",
      buffer,
      folderId
    );

    const { error } = await supabase.from("course_materials").insert({
      course_id: courseId,
      title: title || file.name.replace(/\.pdf$/i, ""),
      drive_file_id: driveId,
      uploaded_by: session?.user.id ?? null,
    });

    if (error) {
      // rollback Drive si l'insertion échoue (ex: RLS)
      await deleteFromDrive(driveId).catch(() => {});
      return { error: error.message };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "UPLOAD_FAILED" };
  }

  revalidatePath("/[locale]/courses", "page");
  return { error: null };
}

/**
 * Étape 1 de l'upload direct (navigateur → Drive) : ouvre une session
 * resumable et renvoie l'URL vers laquelle le client enverra le PDF.
 * Le fichier ne transite PAS par le serveur → pas de limite Vercel de ~4,5 Mo.
 * Seuls les admins/enseignants peuvent obtenir une session.
 */
export async function startMaterialUpload(input: {
  courseId: string;
  fileName: string;
}): Promise<{ uploadUrl: string | null; error: string | null }> {
  if (!isDriveConfigured()) {
    return { uploadUrl: null, error: "GOOGLE_DRIVE_NOT_CONFIGURED" };
  }

  const { role, schoolId } = await getSessionProfile();
  if (role !== "admin" && role !== "teacher") {
    return { uploadUrl: null, error: "FORBIDDEN" };
  }
  if (!input.courseId) {
    return { uploadUrl: null, error: "NO_COURSE" };
  }

  try {
    const folderId = await getSchoolFolderId(schoolId).catch(() => undefined);
    const uploadUrl = await createResumableUploadSession(
      input.fileName || "cours.pdf",
      "application/pdf",
      folderId
    );
    return { uploadUrl, error: null };
  } catch (e) {
    return {
      uploadUrl: null,
      error: e instanceof Error ? e.message : "UPLOAD_INIT_FAILED",
    };
  }
}

/**
 * Étape 2 de l'upload direct : une fois le PDF envoyé par le navigateur,
 * rend le fichier lisible via le lien et enregistre la fiche en base.
 * La RLS Supabase reste la garde finale sur l'insertion.
 */
export async function finalizeMaterial(input: {
  courseId: string;
  title: string;
  driveId: string;
}): Promise<{ error: string | null }> {
  const { role } = await getSessionProfile();
  if (role !== "admin" && role !== "teacher") {
    // On tente de nettoyer le fichier orphelin côté Drive.
    await deleteFromDrive(input.driveId).catch(() => {});
    return { error: "FORBIDDEN" };
  }
  if (!input.courseId || !input.driveId) {
    return { error: "MISSING_DATA" };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  try {
    await makeFilePublic(input.driveId);

    const title = (input.title || "").trim();
    const { error } = await supabase.from("course_materials").insert({
      course_id: input.courseId,
      title: title || "Support de cours",
      drive_file_id: input.driveId,
      uploaded_by: session?.user.id ?? null,
    });

    if (error) {
      await deleteFromDrive(input.driveId).catch(() => {});
      return { error: error.message };
    }
  } catch (e) {
    await deleteFromDrive(input.driveId).catch(() => {});
    return { error: e instanceof Error ? e.message : "FINALIZE_FAILED" };
  }

  revalidatePath("/[locale]/courses", "page");
  return { error: null };
}

export async function deleteMaterial(id: string) {
  const supabase = await createClient();

  const { data: material } = await supabase
    .from("course_materials")
    .select("drive_file_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("course_materials")
    .delete()
    .eq("id", id);

  if (!error && material && isDriveConfigured()) {
    await deleteFromDrive(material.drive_file_id).catch(() => {});
  }

  revalidatePath("/[locale]/courses", "page");
  return { error: error?.message ?? null };
}
