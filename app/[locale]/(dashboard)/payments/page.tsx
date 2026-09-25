import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import PaymentsView, {
  type PaymentRow,
  type StudentFees,
  type ClassOption,
} from "@/components/payments/payments-view";
import ParentPaymentsView from "@/components/payments/parent-payments-view";
import {
  buildAccounts,
  currentPeriod,
  STUDENT_FEE_SELECT,
  type StudentFeeRow,
} from "@/lib/dues";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const t = await getTranslations("dashboard");

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {t("setupNotice")}
      </div>
    );
  }

  const { supabase, role } = await getSessionProfile();
  const isParent = role === "parent";

  // La sécurité de la base (RLS) filtre déjà : un parent ne reçoit que
  // ses enfants et leurs paiements, l'admin toute son école.
  let studentsQuery = supabase
    .from("students")
    .select(STUDENT_FEE_SELECT)
    .order("last_name");
  if (!isParent) studentsQuery = studentsQuery.eq("status", "active");

  const [{ data: payments }, { data: students }, { data: frozen }, { data: classes }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("*, students(first_name, last_name, class_id, classes(name))")
        .order("paid_at", { ascending: false })
        .order("created_at", { ascending: false }),
      studentsQuery,
      supabase.from("monthly_dues").select("student_id, period, amount"),
      isParent
        ? Promise.resolve({ data: [] as ClassOption[] })
        : supabase.from("classes").select("id, name").order("name"),
    ]);

  const rows = (students ?? []) as unknown as StudentFeeRow[];
  const pays = (payments as PaymentRow[]) ?? [];
  const today = currentPeriod();
  const accounts = buildAccounts(rows, pays, frozen ?? [], today);

  const studentFees: StudentFees[] = rows.map((s) => ({
    id: s.id,
    name: `${s.last_name} ${s.first_name}`,
    classId: s.class_id,
    className: s.classes?.name ?? null,
    account: accounts.get(s.id)!,
  }));

  if (isParent) {
    return (
      <ParentPaymentsView
        students={studentFees}
        payments={pays}
        today={today}
      />
    );
  }

  return (
    <PaymentsView
      payments={pays}
      students={studentFees}
      classOptions={(classes as ClassOption[]) ?? []}
      canEdit={role === "admin"}
      today={today}
    />
  );
}
