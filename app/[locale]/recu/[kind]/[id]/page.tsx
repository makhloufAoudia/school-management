import { getTranslations } from "next-intl/server";
import { getSessionProfile } from "@/lib/supabase/profile";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import PrintButton from "@/components/recu/print-button";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------
//  Reçu imprimable — deux formes :
//    /recu/paiement/<id>  : paiement d'un élève (scolarité, transport…)
//    /recu/salaire/<id>   : salaire versé à un enseignant
//
//  La page ne fait AUCUN contrôle de rôle en dur : elle lit la ligne avec
//  le compte connecté, donc la sécurité de la base s'applique telle quelle.
//  Un parent n'obtient que les reçus de ses enfants, un enseignant que ses
//  propres salaires, l'administration tout ce qui concerne son école.
//  Une ligne hors de portée renvoie simplement « reçu introuvable ».
// ---------------------------------------------------------------------

type Ligne = {
  titre: string;
  beneficiaire: string;
  detail: string | null;
  montant: number;
  type: string | null;
  methode: string;
  periode: string | null;
  date: string;
  notes: string | null;
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  const t = await getTranslations("receipt");
  const tp = await getTranslations("payments");

  if (!isSupabaseConfigured()) return <NotFound message={t("notFound")} />;

  const { supabase, schoolId } = await getSessionProfile();

  // Nom de l'école, pour l'en-tête du reçu.
  let schoolName = "";
  if (schoolId) {
    const { data: school } = await supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .maybeSingle();
    schoolName = school?.name ?? "";
  }

  let ligne: Ligne | null = null;

  if (kind === "paiement") {
    const { data } = await supabase
      .from("payments")
      .select(
        "id, amount, type, method, period, paid_at, notes, students(first_name, last_name, classes(name))"
      )
      .eq("id", id)
      .maybeSingle();

    if (data) {
      const eleve = data.students as unknown as {
        first_name: string;
        last_name: string;
        classes: { name: string } | null;
      } | null;
      ligne = {
        titre: t("titlePayment"),
        beneficiaire: eleve ? `${eleve.last_name} ${eleve.first_name}` : "—",
        detail: eleve?.classes?.name ?? null,
        montant: Number(data.amount),
        type: data.type,
        methode: data.method,
        periode: data.period,
        date: data.paid_at,
        notes: data.notes,
      };
    }
  } else if (kind === "salaire") {
    const { data } = await supabase
      .from("salary_payments")
      .select(
        "id, amount, method, period, paid_at, notes, teachers(first_name, last_name)"
      )
      .eq("id", id)
      .maybeSingle();

    if (data) {
      const ens = data.teachers as unknown as {
        first_name: string;
        last_name: string;
      } | null;
      ligne = {
        titre: t("titleSalary"),
        beneficiaire: ens ? `${ens.last_name} ${ens.first_name}` : "—",
        detail: null,
        montant: Number(data.amount),
        type: null,
        methode: data.method,
        periode: data.period,
        date: data.paid_at,
        notes: data.notes,
      };
    }
  }

  if (!ligne) return <NotFound message={t("notFound")} />;

  const numero = id.slice(0, 8).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl p-6 print:p-0">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>

      <div className="rounded-lg border border-slate-300 bg-white p-8 text-slate-900 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 border-b border-slate-300 pb-4 text-center">
          <p className="text-lg font-bold uppercase">{schoolName}</p>
          <p className="mt-1 text-sm text-slate-500">{ligne.titre}</p>
          <p className="mt-1 text-xs text-slate-500">
            {t("number")} : {numero}
          </p>
        </div>

        <dl className="space-y-3 text-sm">
          <Row label={t("beneficiary")} value={ligne.beneficiaire} />
          {ligne.detail && <Row label={tp("class")} value={ligne.detail} />}
          {ligne.type && (
            <Row label={tp("type")} value={tp(`type_${ligne.type}`)} />
          )}
          {ligne.periode && <Row label={tp("period")} value={ligne.periode} />}
          <Row label={tp("method")} value={tp(`method_${ligne.methode}`)} />
          <Row label={tp("date")} value={ligne.date} />
          {ligne.notes && <Row label={tp("notes")} value={ligne.notes} />}
        </dl>

        <div className="mt-6 flex items-center justify-between border-t border-slate-300 pt-4">
          <span className="text-sm font-medium uppercase">{t("amountPaid")}</span>
          <span className="text-xl font-bold">{formatMoney(ligne.montant)}</span>
        </div>

        <div className="mt-12 flex justify-end">
          <div className="w-56 border-t border-slate-400 pt-2 text-center text-xs text-slate-500">
            {t("signature")}
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-400">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dotted border-slate-200 pb-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
        {message}
      </div>
    </div>
  );
}
