import type { FeeBasis, PricingBasis } from "./constants";

export interface PriceInputs {
  currency: string;
  pricingBasis: PricingBasis;
  adultPrice: number;
  /** Null means children pay the same per-person rate as adults. */
  childPrice: number | null;
  /** Discounted adult price, if the tour is on offer. */
  discountPrice: number | null;
  /** Percentage discount (0-100) applied when no explicit discount price is set. */
  discountPercentage: number | null;
  additionalFees: number;
  additionalFeesBasis: FeeBasis;
}

export interface QuoteLine {
  label: string;
  quantity: number;
  unitAmount: number;
  amount: number;
}

export interface Quote {
  currency: string;
  adultUnitPrice: number;
  childUnitPrice: number;
  lines: QuoteLine[];
  /** Total before discounts and fees. */
  grossAmount: number;
  discountAmount: number;
  feesAmount: number;
  totalAmount: number;
}

function applyPercent(amount: number, percent: number | null): number {
  if (!percent || percent <= 0) return amount;
  return Math.round((amount * (100 - Math.min(percent, 100))) / 100);
}

/** The per-unit prices a customer actually pays after discounts. */
export function effectiveUnitPrices(p: PriceInputs): { adult: number; child: number } {
  const adult = p.discountPrice ?? applyPercent(p.adultPrice, p.discountPercentage);
  const child = p.childPrice === null ? adult : applyPercent(p.childPrice, p.discountPercentage);
  return { adult, child };
}

/** The displayed percentage saving on the adult price, if any. */
export function discountPercentOf(p: PriceInputs): number | null {
  const { adult } = effectiveUnitPrices(p);
  if (adult >= p.adultPrice || p.adultPrice === 0) return null;
  return p.discountPercentage ?? Math.round(((p.adultPrice - adult) / p.adultPrice) * 100);
}

/**
 * Calculate the amount payable for a booking. Used by the client to show a
 * live estimate and by the Worker as the authoritative price.
 */
export function calculateQuote(p: PriceInputs, adults: number, children: number): Quote {
  const unit = effectiveUnitPrices(p);
  const guests = adults + children;
  const lines: QuoteLine[] = [];
  let gross: number;
  let net: number;

  if (p.pricingBasis === "per_group") {
    lines.push({ label: `Group price (${guests} guests)`, quantity: 1, unitAmount: unit.adult, amount: unit.adult });
    gross = p.adultPrice;
    net = unit.adult;
  } else {
    if (adults > 0) {
      lines.push({ label: "Adults", quantity: adults, unitAmount: unit.adult, amount: unit.adult * adults });
    }
    if (children > 0) {
      lines.push({ label: "Children", quantity: children, unitAmount: unit.child, amount: unit.child * children });
    }
    const baseChild = p.childPrice ?? p.adultPrice;
    gross = p.adultPrice * adults + baseChild * children;
    net = unit.adult * adults + unit.child * children;
  }

  let fees = 0;
  if (p.additionalFees > 0) {
    const qty = p.additionalFeesBasis === "per_person" ? guests : 1;
    fees = p.additionalFees * qty;
    lines.push({ label: "Additional fees", quantity: qty, unitAmount: p.additionalFees, amount: fees });
  }

  return {
    currency: p.currency,
    adultUnitPrice: unit.adult,
    childUnitPrice: unit.child,
    lines,
    grossAmount: gross,
    discountAmount: Math.max(gross - net, 0),
    feesAmount: fees,
    totalAmount: net + fees,
  };
}
