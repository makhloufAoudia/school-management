import { headers } from "next/headers";
import { schoolSlugFromHost } from "@/lib/school-host";
import { getSchoolBySlug } from "@/lib/actions/tenant";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Détecte l'école à partir du sous-domaine (ex : el-nour.localhost).
  let slug: string | null = null;
  let schoolName: string | null = null;
  let schoolInactive = false;

  if (isSupabaseConfigured()) {
    const h = await headers();
    slug = schoolSlugFromHost(h.get("host"));
    if (slug) {
      const school = await getSchoolBySlug(slug);
      if (school) {
        schoolName = school.name;
        schoolInactive = !school.is_active;
      } else {
        // Sous-domaine inconnu : on retombe sur la connexion plateforme.
        slug = null;
      }
    }
  }

  return (
    <LoginForm
      slug={slug}
      schoolName={schoolName}
      schoolInactive={schoolInactive}
    />
  );
}
