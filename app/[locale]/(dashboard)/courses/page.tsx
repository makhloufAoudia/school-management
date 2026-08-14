import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { isDriveConfigured } from "@/lib/google-drive";
import { getTranslations } from "next-intl/server";
import CoursesView, {
  type CourseRow,
  type Option,
} from "@/components/courses/courses-view";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role, userId } = await getSessionProfile();

  const [{ data: courses }, { data: classes }, { data: subjects }, { data: teachers }] =
    await Promise.all([
      supabase
        .from("courses")
        .select(
          "*, subjects(name), teachers(first_name, last_name), classes(name), course_materials(id, title, drive_file_id)"
        )
        .order("day_of_week")
        .order("start_time"),
      supabase.from("classes").select("id, name, head_teacher_id").order("name"),
      supabase.from("subjects").select("id, name").order("name"),
      supabase
        .from("teachers")
        .select("id, first_name, last_name, profile_id")
        .eq("is_active", true)
        .order("last_name"),
    ]);

  const classRows = (classes ?? []) as (Option & {
    head_teacher_id: string | null;
  })[];
  const classOptions: Option[] = classRows.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const teacherOptions: Option[] = (teachers ?? []).map((x) => ({
    id: x.id,
    name: `${x.first_name} ${x.last_name}`,
  }));

  // Enseignant : il crée un cours dans les classes auxquelles il est
  // rattaché, c'est-à-dire celles dont il est professeur principal et
  // celles où il donne déjà un cours. Même règle que la fonction SQL
  // public.teaches_class, qui tranche pour de bon côté base.
  const myTeacherId =
    role === "teacher"
      ? ((teachers ?? []).find((x) => x.profile_id === userId)?.id ?? null)
      : null;

  const editableClassIds =
    role === "teacher" && myTeacherId
      ? Array.from(
          new Set([
            ...classRows
              .filter((c) => c.head_teacher_id === myTeacherId)
              .map((c) => c.id),
            ...((courses ?? []) as CourseRow[]).map((c) => c.class_id),
          ])
        ).filter(Boolean)
      : [];

  // Parent : la RLS ne renvoie que la/les classe(s) de ses enfants,
  // on pré-sélectionne la première par défaut.
  const defaultClassId = role === "parent" ? (classOptions[0]?.id ?? "") : "";

  return (
    <CoursesView
      courses={(courses as CourseRow[]) ?? []}
      classOptions={classOptions}
      subjectOptions={(subjects as Option[]) ?? []}
      teacherOptions={teacherOptions}
      role={role}
      driveReady={isDriveConfigured()}
      defaultClassId={defaultClassId}
      editableClassIds={editableClassIds}
      myTeacherId={myTeacherId}
    />
  );
}
