"use server";

import { getSessionProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// Statistiques GLOBALES de la plateforme (toutes écoles confondues).
// Réservées au super-administrateur : elles passent par le client
// service_role, qui contourne la RLS — la garde ci-dessous est donc
// la seule protection, elle ne doit jamais être retirée.
export type PlatformStats = {
  schools: number;
  activeSchools: number;
  inactiveSchools: number;
  admins: number;
  blockedAdmins: number;
  teachers: number;
  students: number;
  parents: number;
  classes: number;
  monthRevenue: number;
  yearRevenue: number;
};

const EMPTY: PlatformStats = {
  schools: 0,
  activeSchools: 0,
  inactiveSchools: 0,
  admins: 0,
  blockedAdmins: 0,
  teachers: 0,
  students: 0,
  parents: 0,
  classes: 0,
  monthRevenue: 0,
  yearRevenue: 0,
};

export async function getPlatformStats(): Promise<{
  stats: PlatformStats;
  error: string | null;
}> {
  const { isSuperAdmin } = await getSessionProfile();
  if (!isSuperAdmin) return { stats: EMPTY, error: "unauthorized" };

  const admin = createAdminClient();
  if (!admin) return { stats: EMPTY, error: "missing_service_key" };

  const now = new Date();
  const monthStart = now.toISOString().slice(0, 7) + "-01";
  const yearStart = `${now.getFullYear()}-01-01`;

  const [
    { data: schools },
    { data: profiles },
    { count: teachers },
    { count: students },
    { count: classes },
    { data: payments },
  ] = await Promise.all([
    admin.from("schools").select("is_active"),
    admin.from("profiles").select("role, is_blocked, is_super_admin"),
    admin
      .from("teachers")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    admin.from("classes").select("id", { count: "exact", head: true }),
    admin.from("payments").select("amount, paid_at").gte("paid_at", yearStart),
  ]);

  const schoolRows = schools ?? [];
  const activeSchools = schoolRows.filter((s) => s.is_active).length;

  let admins = 0;
  let blockedAdmins = 0;
  let parents = 0;
  for (const p of profiles ?? []) {
    if (p.is_super_admin) continue; // le super-admin n'est pas un admin d'école
    if (p.role === "admin") {
      admins += 1;
      if (p.is_blocked) blockedAdmins += 1;
    } else if (p.role === "parent") {
      parents += 1;
    }
  }

  let monthRevenue = 0;
  let yearRevenue = 0;
  for (const p of payments ?? []) {
    const amount = Number(p.amount) || 0;
    yearRevenue += amount;
    if (String(p.paid_at) >= monthStart) monthRevenue += amount;
  }

  return {
    stats: {
      schools: schoolRows.length,
      activeSchools,
      inactiveSchools: schoolRows.length - activeSchools,
      admins,
      blockedAdmins,
      teachers: teachers ?? 0,
      students: students ?? 0,
      parents,
      classes: classes ?? 0,
      monthRevenue,
      yearRevenue,
    },
    error: null,
  };
}
