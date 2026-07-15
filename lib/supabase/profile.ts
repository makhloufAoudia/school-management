import { createClient } from "./server";

export type SessionProfile = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
  fullName: string;
  role: "admin" | "teacher" | "parent";
  schoolId: string | null;
  isSuperAdmin: boolean;
};

// Lit la session depuis le cookie (le middleware a deja valide l'utilisateur)
// puis charge le profil en une requete.
export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      supabase,
      userId: null,
      fullName: "",
      role: "parent",
      schoolId: null,
      isSuperAdmin: false,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, school_id, is_super_admin")
    .eq("id", session.user.id)
    .single();

  return {
    supabase,
    userId: session.user.id,
    fullName: profile?.full_name || session.user.email || "",
    role: profile?.role ?? "parent",
    schoolId: profile?.school_id ?? null,
    isSuperAdmin: profile?.is_super_admin ?? false,
  };
}
