import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDriveConfigured, moveDriveFile } from "@/lib/google-drive";
import { getSchoolFolderId } from "@/lib/school-drive";

export const dynamic = "force-dynamic";

// Outil ponctuel (super-admin) : range les PDF existants dans le sous-dossier
// Drive de leur école. Ré-exécutable sans risque (idempotent).
export async function GET() {
  const { isSuperAdmin } = await getSessionProfile();
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "drive_not_configured" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "missing_service_key" }, { status: 400 });
  }

  const [{ data: materials }, { data: courses }] = await Promise.all([
    admin.from("course_materials").select("id, drive_file_id, course_id"),
    admin.from("courses").select("id, school_id"),
  ]);

  const schoolByCourse = new Map<string, string>();
  for (const c of courses ?? []) {
    if (c.school_id) schoolByCourse.set(c.id, c.school_id);
  }

  const folderCache = new Map<string, string | undefined>();
  let moved = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of materials ?? []) {
    const schoolId = m.course_id ? schoolByCourse.get(m.course_id) : undefined;
    if (!schoolId || !m.drive_file_id) {
      skipped += 1;
      continue;
    }
    let folderId = folderCache.get(schoolId);
    if (folderId === undefined && !folderCache.has(schoolId)) {
      folderId = await getSchoolFolderId(schoolId).catch(() => undefined);
      folderCache.set(schoolId, folderId);
    }
    if (!folderId) {
      skipped += 1;
      continue;
    }
    try {
      await moveDriveFile(m.drive_file_id, folderId);
      moved += 1;
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({
    total: materials?.length ?? 0,
    moved,
    skipped,
    failed,
  });
}
