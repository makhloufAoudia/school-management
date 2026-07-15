import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadFromDrive, isDriveConfigured } from "@/lib/google-drive";
import { createZip, type ZipEntry } from "@/lib/zip";

export const dynamic = "force-dynamic";

type MaterialRow = {
  title: string;
  drive_file_id: string;
  courses: {
    class_id: string;
    subjects: { name: string } | null;
    classes: { name: string } | null;
  } | null;
};

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "cours";
}

export async function GET(req: NextRequest) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "DRIVE_NOT_CONFIGURED" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const courseId = req.nextUrl.searchParams.get("course");
  const classId = req.nextUrl.searchParams.get("classId");

  // RLS filtre déjà selon le rôle (admin = tout, parent = classe de l'enfant…)
  let query = supabase
    .from("course_materials")
    .select(
      "title, drive_file_id, courses!inner(class_id, subjects(name), classes(name))"
    );

  if (courseId) query = query.eq("course_id", courseId);
  if (classId) query = query.eq("courses.class_id", classId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const materials = (data as unknown as MaterialRow[]) ?? [];
  if (materials.length === 0) {
    return NextResponse.json({ error: "NO_MATERIALS" }, { status: 404 });
  }

  // Récupère les fichiers en parallèle depuis Drive
  const seen = new Map<string, number>();
  const results = await Promise.all(
    materials.map(async (m) => {
      try {
        const buf = await downloadFromDrive(m.drive_file_id);
        const subject = m.courses?.subjects?.name;
        let base = sanitize(subject ? `${subject} - ${m.title}` : m.title);
        if (!/\.pdf$/i.test(base)) base += ".pdf";
        // nom unique dans l'archive
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const name = n === 0 ? base : base.replace(/\.pdf$/i, ` (${n}).pdf`);
        return { name, data: buf } as ZipEntry;
      } catch {
        return null;
      }
    })
  );

  const entries = results.filter((e): e is ZipEntry => e !== null);
  if (entries.length === 0) {
    return NextResponse.json({ error: "DOWNLOAD_FAILED" }, { status: 502 });
  }

  const zip = createZip(entries);
  const className = materials[0]?.courses?.classes?.name;
  const fileName = sanitize(
    courseId
      ? `supports-${materials[0]?.courses?.subjects?.name ?? "cours"}`
      : className && classId
        ? `supports-${className}`
        : "supports-cours"
  );

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
