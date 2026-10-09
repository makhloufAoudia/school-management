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

  if (isSupabaseConfigured()) {
    const session = await getSessionProfile();
    if (!session.userId) {
      redirect({ href: "/login", locale });
    }
    role = session.role;
    userName = session.fullName;
    isSuperAdmin = session.isSuperAdmin;
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar role={role} userName={userName} isSuperAdmin={isSuperAdmin} />
      <main className="app-main w-full min-w-0 flex-1 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-6">
        {children}
      </main>
    </div>
  );
}
