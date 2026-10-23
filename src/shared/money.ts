// Money is always stored as an integer number of the currency's minor unit
// (e.g. cents). RWF has no minor unit in practice, so 41,000 RWF is stored as 41000.

export const CURRENCIES = {
  RWF: { exponent: 0, label: "Rwandan Franc" },
  USD: { exponent: 2, label: "US Dollar" },
  EUR: { exponent: 2, label: "Euro" },
  KES: { exponent: 2, label: "Kenyan Shilling" },
  UGX: { exponent: 0, label: "Ugandan Shilling" },
  TZS: { exponent: 2, label: "Tanzanian Shilling" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

function exponentOf(currency: string): number {
  return isCurrencyCode(currency) ? CURRENCIES[currency].exponent : 2;
}

/** Convert a major-unit amount typed by a person (e.g. 12.50) to minor units. */
export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** exponentOf(currency));
}

/** Convert stored minor units to a major-unit number for form inputs. */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** exponentOf(currency);
}

export function formatMoney(minor: number, currency: string): string {
  const exponent = exponentOf(currency);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);
  return `${formatted} ${currency}`;
}
