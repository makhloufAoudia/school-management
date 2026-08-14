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

  // L'enseignant gère les élèves des classes où il a un cours : on limite la
  // liste déroulante à ces classes, sinon l'enregistrement serait refusé par
  // la sécurité de la base (voir 2026-08-droits-enseignant.sql).
  let classOptions = (classes as ClassOption[]) ?? [];
  if (role === "teacher") {
    const { data: mine } = await supabase.from("courses").select("class_id");
    const allowed = new Set(
      ((mine as { class_id: string | null }[] | null) ?? [])
        .map((c) => c.class_id)
        .filter(Boolean) as string[]
    );
    classOptions = classOptions.filter((c) => allowed.has(c.id));
  }

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
      classOptions={classOptions}
      canEdit={role === "admin" || role === "teacher"}
      canDelete={role === "admin"}
      canManageAccounts={role === "admin"}
      defaultClassId={defaultClassId}
      guardians={guardians}
    />
  );
}
