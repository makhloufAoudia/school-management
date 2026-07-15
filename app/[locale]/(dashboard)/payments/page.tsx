import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { getTranslations } from "next-intl/server";
import PaymentsView, {
  type PaymentRow,
  type StudentOption,
  type ClassDue,
  type ClassOption,
  type GeneratedDue,
} from "@/components/payments/payments-view";

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

  const [
    { data: payments },
    { data: students },
    { data: classDues },
    { data: classes },
    { data: generatedDues },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("*, students(first_name, last_name, class_id, classes(name))")
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("students")
      .select("id, first_name, last_name, class_id, classes(name, monthly_fee, extra_fee)")
      .eq("status", "active")
      .order("last_name"),
    supabase
      .from("class_dues")
      .select("*, classes(name)")
      .order("created_at", { ascending: false }),
    supabase.from("classes").select("id, name, extra_fee").order("name"),
    supabase
      .from("monthly_dues")
      .select("student_id, period, amount"),
  ]);

  const studentOptions: StudentOption[] = (students ?? []).map((s) => {
    const cls = s.classes as unknown as {
      name: string;
      monthly_fee: number;
      extra_fee: number;
    } | null;
    return {
      id: s.id,
      classId: s.class_id,
      name: `${s.last_name} ${s.first_name}${cls ? ` — ${cls.name}` : ""}`,
      className: cls?.name ?? null,
      monthlyFee: Number(cls?.monthly_fee ?? 0),
      extraFee: Number(cls?.extra_fee ?? 0),
    };
  });

  const defaultClassId =
    role === "parent" ? ((classes as ClassOption[] | null)?.[0]?.id ?? "") : "";

  return (
    <PaymentsView
      payments={(payments as PaymentRow[]) ?? []}
      studentOptions={studentOptions}
      classDues={(classDues as ClassDue[]) ?? []}
      classOptions={(classes as ClassOption[]) ?? []}
      generatedDues={(generatedDues as GeneratedDue[]) ?? []}
      canEdit={role === "admin"}
      defaultClassId={defaultClassId}
    />
  );
}
