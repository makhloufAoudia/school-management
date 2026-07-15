import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDriveFolder } from "@/lib/google-drive";

// Renvoie l'ID du sous-dossier Drive dédié à une école (le crée à la première
// utilisation et le mémorise dans schools.drive_folder_id). Ainsi, les PDF de
// chaque école sont rangés séparément. Renvoie undefined si indisponible
// (on retombe alors sur le dossier racine).
export async function getSchoolFolderId(
  schoolId: string | null | undefined
): Promise<string | undefined> {
  if (!schoolId) return undefined;
  const admin = createAdminClient();
  if (!admin) return undefined;

  const { data: school } = await admin
    .from("schools")
    .select("name, slug, drive_folder_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (!school) return undefined;
  if (school.drive_folder_id) return school.drive_folder_id as string;

  // Pas encore de dossier : on le crée puis on le mémorise.
  const folderId = await createDriveFolder(`${school.name} (${school.slug})`);
  await admin
    .from("schools")
    .update({ drive_folder_id: folderId })
    .eq("id", schoolId);
  return folderId;
}
