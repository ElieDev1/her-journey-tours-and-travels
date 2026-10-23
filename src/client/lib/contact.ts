/** Normalise a Rwandan or international number to E.164 digits (no "+"). */
export function toInternational(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("250")) return digits;
  if (digits.startsWith("0")) return `250${digits.slice(1)}`;
  return digits;
}

export function telHref(phone: string): string {
  return `tel:+${toInternational(phone)}`;
}

export function whatsappHref(phone: string, message?: string): string {
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${toInternational(phone)}${text}`;
}

/** Display a local number in groups, e.g. 0783 937 619. */
export function formatPhone(phone: string): string {
  const d = phone.replace(/\s+/g, "");
  return /^0\d{9}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : phone;
}
