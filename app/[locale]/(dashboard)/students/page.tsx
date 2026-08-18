import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import StudentsView, {
  type StudentRow,
  type ClassOption,
  type StudentPayments,
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

  // La base ne renvoie à l'enseignant que SES classes (celles où il donne un
  // cours et celles dont il est professeur principal) — voir la migration
  // 2026-08-enseignant-voit-sa-classe.sql. La liste déroulante correspond
  // donc exactement aux classes où il a le droit d'inscrire un élève.
  const classOptions = (classes as ClassOption[]) ?? [];

  // ---------- Détail de paiement, par élève ----------
  // Réservé à l'administration : ni l'enseignant ni le parent d'un autre
  // élève ne doivent voir cette partie (la base le refuserait de toute
  // façon, mais autant ne rien demander).
  // Le dû est calculé comme dans la page Paiements : échéances réellement
  // générées + dûs de classe jusqu'au mois en cours + somme fixe de la
  // classe comptée une seule fois.
  const paymentsByStudent: Record<string, StudentPayments> = {};
  if (role === "admin") {
    const moisCourant = new Date().toISOString().slice(0, 7);
    const [{ data: paiements }, { data: echeances }, { data: dusClasse }, { data: fraisClasse }] =
      await Promise.all([
        supabase
          .from("payments")
          .select("id, student_id, amount, type, period, paid_at")
          .order("paid_at", { ascending: false }),
        supabase.from("monthly_dues").select("student_id, period, amount"),
        supabase.from("class_dues").select("class_id, period, amount"),
        supabase.from("classes").select("id, extra_fee"),
      ]);

    const duParEleve = new Map<string, number>();
    for (const e of echeances ?? []) {
      if (e.period > moisCourant) continue;
      duParEleve.set(
        e.student_id,
        (duParEleve.get(e.student_id) ?? 0) + Number(e.amount)
      );
    }
    const duParClasse = new Map<string, number>();
    for (const d of dusClasse ?? []) {
      if (d.period > moisCourant) continue;
      duParClasse.set(
        d.class_id,
        (duParClasse.get(d.class_id) ?? 0) + Number(d.amount)
      );
    }
    const fraisFixeParClasse = new Map<string, number>();
    for (const c of fraisClasse ?? []) {
      fraisFixeParClasse.set(c.id, Number(c.extra_fee ?? 0));
    }

    for (const s of (students as StudentRow[]) ?? []) {
      const lignes = (paiements ?? [])
        .filter((p) => p.student_id === s.id)
        .map((p) => ({
          id: p.id as string,
          amount: Number(p.amount),
          type: p.type as string,
          period: (p.period as string) ?? null,
          paid_at: p.paid_at as string,
        }));
      const paye = lignes.reduce((sum, l) => sum + l.amount, 0);
      const du =
        (duParEleve.get(s.id) ?? 0) +
        (s.class_id ? (duParClasse.get(s.class_id) ?? 0) : 0) +
        (s.class_id ? (fraisFixeParClasse.get(s.class_id) ?? 0) : 0);
      paymentsByStudent[s.id] = {
        due: du,
        paid: paye,
        remaining: Math.max(0, du - paye),
        rows: lignes,
      };
    }
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
      paymentsByStudent={paymentsByStudent}
    />
  );
}
