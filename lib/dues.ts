// ---------------------------------------------------------------------
//  MENSUALITÉS — calcul unique, partagé par toutes les pages
// ---------------------------------------------------------------------
//  Règle simple :
//    * l'admin fixe un tarif mensuel par classe (classes.monthly_fee) ;
//    * chaque mois de l'année scolaire, à partir du mois d'inscription,
//      l'élève doit ce tarif — automatiquement, sans bouton à cliquer ;
//    * un paiement « scolarité » est rattaché au mois indiqué dans
//      « Période » (à défaut, au mois de la date de paiement) ;
//    * si le tarif de la classe change, les mois déjà passés gardent
//      l'ancien montant (table monthly_dues = montants figés).
//
//  Ce fichier ne fait aucune requête : il reçoit les données et calcule.
//  Admin (page Paiements), parent (sa page Paiements + tableau de bord)
//  et le bon imprimable utilisent tous cette même fonction, donc les
//  chiffres sont identiques partout.
// ---------------------------------------------------------------------

export type DueStatus = "paid" | "partial" | "unpaid" | "upcoming";

export type DueMonth = {
  period: string; // "2026-09"
  due: number;
  paid: number;
  remaining: number;
  status: DueStatus;
  upcoming: boolean; // mois pas encore arrivé
};

export type StudentAccount = {
  monthlyFee: number;
  months: DueMonth[];
  totalDue: number; // dû jusqu'au mois courant (inclus)
  totalPaid: number;
  remaining: number; // reste à payer à ce jour
};

export type TuitionPayment = {
  amount: number | string;
  type: string;
  period: string | null;
  paid_at: string;
};

// "YYYY-MM" du jour, en heure locale.
export function currentPeriod(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to && out.length < 24; p = addMonths(p, 1)) out.push(p);
  return out;
}

// Bornes de l'année scolaire. Sans année scolaire renseignée : septembre
// -> juin (10 mois), l'année en cours étant déduite de la date du jour.
export function schoolYearBounds(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string = currentPeriod()
): { from: string; to: string } {
  let from: string;
  if (start) {
    from = start.slice(0, 7);
  } else {
    const [y, m] = today.split("-").map(Number);
    from = `${m >= 9 ? y : y - 1}-09`;
  }
  const to = end ? end.slice(0, 7) : addMonths(from, 9);
  return { from, to };
}

export function paymentPeriod(p: { period: string | null; paid_at: string }) {
  return p.period || p.paid_at.slice(0, 7);
}

export function computeAccount(opts: {
  monthlyFee: number;
  enrollmentDate?: string | null;
  yearStart?: string | null;
  yearEnd?: string | null;
  frozen?: Map<string, number>; // période -> montant figé
  payments: TuitionPayment[]; // paiements de CET élève (tous types)
  today?: string;
}): StudentAccount {
  const today = opts.today ?? currentPeriod();
  const fee = Number(opts.monthlyFee) || 0;
  const bounds = schoolYearBounds(opts.yearStart, opts.yearEnd, today);
  const enrolled = opts.enrollmentDate?.slice(0, 7) ?? bounds.from;
  const from = enrolled > bounds.from ? enrolled : bounds.from;

  const paidBy = new Map<string, number>();
  for (const p of opts.payments) {
    if (p.type !== "tuition") continue;
    const k = paymentPeriod(p);
    paidBy.set(k, (paidBy.get(k) ?? 0) + Number(p.amount));
  }

  const months: DueMonth[] = monthRange(from, bounds.to).map((period) => {
    const due = opts.frozen?.get(period) ?? fee;
    const paid = paidBy.get(period) ?? 0;
    const upcoming = period > today;
    const remaining = Math.max(0, due - paid);
    const status: DueStatus =
      due <= 0 || remaining <= 0
        ? "paid"
        : upcoming && paid === 0
          ? "upcoming"
          : paid > 0
            ? "partial"
            : "unpaid";
    return { period, due, paid, remaining, status, upcoming };
  });

  // Un mois à venir compte seulement s'il a déjà été (partiellement) payé.
  let totalDue = 0;
  let totalPaid = 0;
  for (const m of months) {
    if (!m.upcoming || m.paid > 0) totalDue += m.due;
    totalPaid += m.paid;
  }

  return {
    monthlyFee: fee,
    months,
    totalDue,
    totalPaid,
    remaining: Math.max(0, totalDue - totalPaid),
  };
}

// Données brutes d'un élève telles que lues dans Supabase.
export type StudentFeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  enrollment_date: string | null;
  classes: {
    name: string;
    monthly_fee: number;
    academic_years: { start_date: string; end_date: string } | null;
  } | null;
};

export const STUDENT_FEE_SELECT =
  "id, first_name, last_name, class_id, enrollment_date, classes(name, monthly_fee, academic_years(start_date, end_date))";

// Calcule le compte de chaque élève à partir des lignes brutes.
export function buildAccounts(
  students: StudentFeeRow[],
  payments: (TuitionPayment & { student_id: string })[],
  frozenRows: { student_id: string; period: string; amount: number | string }[],
  today: string = currentPeriod()
): Map<string, StudentAccount> {
  const payBy = new Map<string, TuitionPayment[]>();
  for (const p of payments) {
    const arr = payBy.get(p.student_id) ?? [];
    arr.push(p);
    payBy.set(p.student_id, arr);
  }
  const frozenBy = new Map<string, Map<string, number>>();
  for (const f of frozenRows) {
    const m = frozenBy.get(f.student_id) ?? new Map<string, number>();
    m.set(f.period, Number(f.amount));
    frozenBy.set(f.student_id, m);
  }
  const res = new Map<string, StudentAccount>();
  for (const s of students) {
    res.set(
      s.id,
      computeAccount({
        monthlyFee: Number(s.classes?.monthly_fee ?? 0),
        enrollmentDate: s.enrollment_date,
        yearStart: s.classes?.academic_years?.start_date,
        yearEnd: s.classes?.academic_years?.end_date,
        frozen: frozenBy.get(s.id),
        payments: payBy.get(s.id) ?? [],
        today,
      })
    );
  }
  return res;
}
