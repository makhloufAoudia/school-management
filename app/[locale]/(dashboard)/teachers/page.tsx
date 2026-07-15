import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import TeachersView, {
  type TeacherRow,
} from "@/components/teachers/teachers-view";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();

  const { data: teachers } = await supabase
    .from("teachers")
    .select("*")
    .order("last_name")
    .order("first_name");

  return (
    <TeachersView
      teachers={(teachers as TeacherRow[]) ?? []}
      canEdit={role === "admin"}
    />
  );
}
