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

// Indicatif pays utilisé pour les numéros saisis au format local (0X XX...).
// Configurable via NEXT_PUBLIC_PHONE_COUNTRY_CODE (ex: "213", "212", "33").
const PHONE_CC = process.env.NEXT_PUBLIC_PHONE_COUNTRY_CODE?.trim() || "213";

// Numéro au format international sans "+", tel qu'attendu par wa.me.
// "0555 12 34 56" -> "213555123456" ; "+213555..." -> "213555...".
export function toWhatsAppNumber(phone: string | null | undefined): string {
  const raw = (phone ?? "").replace(/[^\d+]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) return raw.slice(1);
  if (raw.startsWith("00")) return raw.slice(2);
  if (raw.startsWith("0")) return PHONE_CC + raw.slice(1);
  return raw;
}

// Lien « cliquer pour discuter » WhatsApp. Sans numéro exploitable, WhatsApp
// s'ouvre quand même et laisse choisir le destinataire dans les contacts.
export function whatsAppLink(
  phone: string | null | undefined,
  text: string
): string {
  const num = toWhatsAppNumber(phone);
  const msg = encodeURIComponent(text);
  return num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
}
