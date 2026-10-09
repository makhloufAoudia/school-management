import { redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import Sidebar from "@/components/sidebar";
import { getLocale } from "next-intl/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  let role: "admin" | "teacher" | "parent" = "admin";
  let userName = "Mode configuration";
  let isSuperAdmin = false;
  let email = "";
  let schoolName = "";

  if (isSupabaseConfigured()) {
    const session = await getSessionProfile();
    if (!session.userId) {
      redirect({ href: "/login", locale });
    }
    role = session.role;
    userName = session.fullName;
    isSuperAdmin = session.isSuperAdmin;
    email = session.email;
    // Nom de l'école du compte : affiché sous le nom de l'utilisateur pour
    // savoir d'un coup d'œil sur quel compte / quelle école on se trouve.
    if (session.schoolId) {
      const { data: school } = await session.supabase
        .from("schools")
        .select("name")
        .eq("id", session.schoolId)
        .maybeSingle();
      schoolName = school?.name ?? "";
    }
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        role={role}
        userName={userName}
        isSuperAdmin={isSuperAdmin}
        email={email}
        schoolName={schoolName}
      />
      <main className="app-main w-full min-w-0 flex-1 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-6">
        {children}
      </main>
    </div>
  );
}
