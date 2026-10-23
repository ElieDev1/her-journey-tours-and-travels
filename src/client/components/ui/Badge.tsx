import type { ReactNode } from "react";
import { cn } from "@client/lib/cn";
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  TOUR_STATUS_LABELS,
  DEPARTURE_STATUS_LABELS,
  type BookingStatus,
  type DepartureStatus,
  type PaymentStatus,
  type TourStatus,
} from "@shared/constants";

export type Tone = "green" | "sage" | "gold" | "red" | "blue" | "gray";

const tones: Record<Tone, string> = {
  green: "bg-forest-50 text-forest-700 ring-forest-700/15",
  sage: "bg-sage-100 text-sage-700 ring-sage-600/20",
  gold: "bg-sun-100 text-sun-700 ring-sun-600/25",
  red: "bg-danger-50 text-danger-700 ring-danger-600/20",
  blue: "bg-info-50 text-info-600 ring-info-600/20",
  gray: "bg-stone-100 text-stone-600 ring-stone-500/20",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

const bookingTones: Record<BookingStatus, Tone> = {
  pending_payment: "gold",
  payment_submitted: "blue",
  confirmed: "green",
  cancelled: "red",
  expired: "gray",
  refunded: "sage",
};
const paymentTones: Record<PaymentStatus, Tone> = {
  pending: "gold",
  submitted: "blue",
  verified: "green",
  rejected: "red",
  refunded: "sage",
};
const tourTones: Record<TourStatus, Tone> = { draft: "gray", published: "green", archived: "red" };
const departureTones: Record<DepartureStatus, Tone> = { scheduled: "green", closed: "gold", cancelled: "red", completed: "gray" };

export const BookingStatusBadge = ({ status }: { status: BookingStatus }) => (
  <Badge tone={bookingTones[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>
);
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => (
  <Badge tone={paymentTones[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>
);
export const TourStatusBadge = ({ status }: { status: TourStatus }) => <Badge tone={tourTones[status]}>{TOUR_STATUS_LABELS[status]}</Badge>;
export const DepartureStatusBadge = ({ status }: { status: DepartureStatus }) => (
  <Badge tone={departureTones[status]}>{DEPARTURE_STATUS_LABELS[status]}</Badge>
);
