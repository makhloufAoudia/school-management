// Devise de l'établissement — configurable via NEXT_PUBLIC_CURRENCY (ex: "DA", "€", "MAD").
// Valeur par défaut : "DA" (dinar algérien).
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY?.trim() || "DA";

// Formatte un montant avec séparateurs de milliers + devise.
// Toujours affiché en LTR (les chiffres restent lisibles en interface RTL).
export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString()} ${CURRENCY}`;
}
