import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import RequestsView, {
  type RequestRow,
  type Option,
  type CourseOption,
} from "@/components/schedule/requests-view";

export const dynamic = "force-dynamic";

// Demandes de modification de l'emploi du temps.
// - Enseignant : dépose ses demandes et suit leur avancement.
// - Administration : accepte (le cours est modifié) ou refuse.
export default async function SchedulePage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();
  const isAdmin = role === "admin";

  // La RLS fait le tri : l'enseignant ne voit que ses demandes et ses cours,
  // l'administration voit tout ce qui concerne son école.
  const [{ data: requests }, { data: courses }, { data: classes }, { data: subjects }] =
    await Promise.all([
      supabase
        .from("schedule_requests")
        .select("*")
        .order("status")
        .order("created_at", { ascending: false }),
      supabase
        .from("courses")
        .select("id, day_of_week, start_time, room, subjects(name), classes(name)")
        .order("day_of_week")
        .order("start_time"),
      supabase.from("classes").select("id, name").order("name"),
      supabase.from("subjects").select("id, name").order("name"),
    ]);

  type RawCourse = {
    id: string;
    day_of_week: number | null;
    start_time: string | null;
    room: string | null;
    subjects: { name: string } | null;
    classes: { name: string } | null;
  };

  const courseOptions: CourseOption[] = ((courses as RawCourse[] | null) ?? []).map(
    (c) => ({
      id: c.id,
      label: [
        c.classes?.name,
        c.subjects?.name,
        c.start_time?.slice(0, 5),
        c.room,
      ]
        .filter(Boolean)
        .join(" · "),
    })
  );

  const rows = (requests as RequestRow[]) ?? [];

  // Noms des demandeurs, pour l'affichage côté administration.
  const requesters: Record<string, string> = {};
  if (isAdmin && rows.length > 0) {
    const ids = [...new Set(rows.map((r) => r.requested_by))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of (profiles as { id: string; full_name: string }[]) ?? []) {
      requesters[p.id] = p.full_name;
    }
  }

  return (
    <RequestsView
      requests={rows}
      courseOptions={courseOptions}
      classOptions={(classes as Option[]) ?? []}
      subjectOptions={(subjects as Option[]) ?? []}
      requesters={requesters}
      isAdmin={isAdmin}
    />
  );
}
