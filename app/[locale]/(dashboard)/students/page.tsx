import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import StudentsView, {
  type StudentRow,
  type ClassOption,
} from "@/components/students/students-view";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();

  const [{ data: students }, { data: classes }] = await Promise.all([
    supabase
      .from("students")
      .select("*, classes(name)")
      .order("last_name")
      .order("first_name"),
    supabase.from("classes").select("id, name").order("name"),
  ]);

  const defaultClassId =
    role === "parent" ? ((classes as ClassOption[] | null)?.[0]?.id ?? "") : "";

  // Noms des comptes parents rattachés, pour la colonne « Compte ».
  const rows = (students as StudentRow[]) ?? [];
  const guardianIds = [
    ...new Set(rows.map((s) => s.guardian_id).filter(Boolean) as string[]),
  ];
  const guardians: Record<string, string> = {};
  if (guardianIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", guardianIds);
    for (const p of (profiles as { id: string; full_name: string }[]) ?? []) {
      guardians[p.id] = p.full_name;
    }
  }

  return (
    <StudentsView
      students={rows}
      classOptions={(classes as ClassOption[]) ?? []}
      canEdit={role === "admin"}
      defaultClassId={defaultClassId}
      guardians={guardians}
    />
  );
}
