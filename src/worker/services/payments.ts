import { and, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../db/client";
import { bookings, payments } from "../db/schema";
import type { PaymentDTO } from "../../shared/types";
import type { manualPaymentSchema, paymentRefundSchema, paymentSubmitSchema } from "../../shared/schemas";
import { addMinutes, nowIso } from "../../shared/time";
import { HttpError, isUniqueViolation, notFound } from "../lib/http";
import { confirmBooking, transitionReleasingSeats, type BookingRow } from "./bookings";

export type PaymentRow = typeof payments.$inferSelect;

export function paymentToDTO(p: PaymentRow, includeAdmin: boolean, reviewedByName?: string | null): PaymentDTO {
  return {
    id: p.id,
    bookingId: p.bookingId,
    method: p.method,
    provider: p.provider,
    merchantCode: p.merchantCode,
    transactionReference: p.transactionReference,
    payerPhone: p.payerPhone,
    amount: p.amount,
    currency: p.currency,
    paidAt: p.paidAt,
    status: p.status,
    submittedAt: p.submittedAt,
    reviewedAt: p.reviewedAt,
    rejectionReason: p.rejectionReason,
    refundedAt: p.refundedAt,
    refundAmount: p.refundAmount,
    refundReference: p.refundReference,
    createdAt: p.createdAt,
    ...(includeAdmin ? { adminNotes: p.adminNotes, reviewedByName: reviewedByName ?? null } : {}),
  };
}

const duplicateReference = () =>
  new HttpError(409, "This transaction ID has already been submitted. Contact us if you think this is a mistake.", {
    transactionReference: "Already submitted",
  });

/**
 * A customer reports a MoMo payment. This never marks anything as paid:
 * the payment waits in "submitted" until an administrator verifies it.
 */
export async function submitPayment(
  db: Database,
  booking: BookingRow,
  input: z.output<typeof paymentSubmitSchema>,
  merchantCode: string,
): Promise<PaymentRow> {
  if (!["pending_payment", "payment_submitted", "expired"].includes(booking.status)) {
    throw new HttpError(409, "This booking is not awaiting payment.");
  }
  const now = nowIso();
  const details = {
    transactionReference: input.transactionReference.toUpperCase(),
    payerPhone: input.payerPhone,
    amount: input.amount,
    paidAt: input.paidAt,
    merchantCode,
    status: "submitted" as const,
    submittedAt: now,
  };

  const placeholder = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.status, "pending")))
    .get();

  let payment: PaymentRow | undefined;
  try {
    payment = placeholder
      ? await db
          .update(payments)
          .set(details)
          .where(and(eq(payments.id, placeholder.id), eq(payments.status, "pending")))
          .returning()
          .get()
      : await db
          .insert(payments)
          .values({ ...details, bookingId: booking.id, method: "momo_pay", provider: "manual", currency: booking.currency })
          .returning()
          .get();
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateReference();
    throw err;
  }
  if (!payment) throw new HttpError(409, "Your payment was already submitted. Refresh to see its status.");

  if (booking.status === "pending_payment") {
    await db
      .update(bookings)
      .set({ status: "payment_submitted" })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "pending_payment")));
  }
  return payment;
}

async function verifiedTotal(db: Database, bookingId: number): Promise<number> {
  const rows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "verified")));
  return rows.reduce((s, r) => s + r.amount, 0);
}

async function loadPaymentWithBooking(db: Database, paymentId: number) {
  const row = await db
    .select({ payment: payments, booking: bookings })
    .from(payments)
    .innerJoin(bookings, eq(payments.bookingId, bookings.id))
    .where(eq(payments.id, paymentId))
    .get();
  if (!row) throw notFound("Payment");
  return row;
}

export interface VerifyResult {
  bookingConfirmed: boolean;
  message: string;
}

export async function verifyPayment(
  db: Database,
  d1: D1Database,
  paymentId: number,
  adminId: number,
  notes: string | null,
): Promise<VerifyResult & { bookingId: number }> {
  const { payment, booking } = await loadPaymentWithBooking(db, paymentId);
  if (payment.status !== "submitted") throw new HttpError(409, `Only submitted payments can be verified (this one is ${payment.status}).`);

  const updated = await db
    .update(payments)
    .set({ status: "verified", reviewedAt: nowIso(), reviewedBy: adminId, adminNotes: notes ?? payment.adminNotes })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "submitted")))
    .returning({ id: payments.id })
    .get();
  if (!updated) throw new HttpError(409, "This payment was reviewed by someone else. Refresh and try again.");

  const paid = await verifiedTotal(db, booking.id);
  if (paid < booking.totalAmount) {
    return {
      bookingId: booking.id,
      bookingConfirmed: false,
      message: "Payment verified. The verified total does not yet cover the booking, so it has not been confirmed.",
    };
  }
  try {
    await confirmBooking(d1, booking);
  } catch (err) {
    if (err instanceof HttpError) {
      return { bookingId: booking.id, bookingConfirmed: false, message: `Payment verified, but ${err.message}` };
    }
    throw err;
  }
  return { bookingId: booking.id, bookingConfirmed: true, message: "Payment verified and booking confirmed." };
}

export async function rejectPayment(
  db: Database,
  paymentId: number,
  adminId: number,
  reason: string,
  holdMinutes: number,
): Promise<{ bookingId: number }> {
  const { payment, booking } = await loadPaymentWithBooking(db, paymentId);
  if (payment.status !== "submitted") throw new HttpError(409, `Only submitted payments can be rejected (this one is ${payment.status}).`);

  const updated = await db
    .update(payments)
    .set({ status: "rejected", reviewedAt: nowIso(), reviewedBy: adminId, rejectionReason: reason })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "submitted")))
    .returning({ id: payments.id })
    .get();
  if (!updated) throw new HttpError(409, "This payment was reviewed by someone else. Refresh and try again.");

  // With nothing else awaiting review, the customer gets a fresh window to pay.
  const stillSubmitted = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.status, "submitted")))
    .get();
  if (!stillSubmitted && booking.status === "payment_submitted") {
    await db
      .update(bookings)
      .set({ status: "pending_payment", expiresAt: addMinutes(new Date(), holdMinutes).toISOString() })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "payment_submitted")));
  }
  return { bookingId: booking.id };
}

export async function refundPayment(
  db: Database,
  d1: D1Database,
  paymentId: number,
  adminId: number,
  input: z.output<typeof paymentRefundSchema>,
): Promise<{ bookingId: number; bookingRefunded: boolean }> {
  const { payment, booking } = await loadPaymentWithBooking(db, paymentId);
  if (payment.status !== "verified") throw new HttpError(409, "Only verified payments can be refunded.");
  if (input.amount > payment.amount) {
    throw new HttpError(400, "The refund cannot exceed the payment amount.", { amount: "Too large" });
  }
  const updated = await db
    .update(payments)
    .set({
      status: "refunded",
      refundedAt: nowIso(),
      refundAmount: input.amount,
      refundReference: input.refundReference,
      reviewedBy: adminId,
      adminNotes: input.notes ?? payment.adminNotes,
    })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "verified")))
    .returning({ id: payments.id })
    .get();
  if (!updated) throw new HttpError(409, "This payment changed while you were working. Refresh and try again.");

  // Once no verified money remains, the booking itself is refunded and its seats released.
  const remaining = await verifiedTotal(db, booking.id);
  let bookingRefunded = false;
  if (remaining === 0) {
    bookingRefunded = await transitionReleasingSeats(
      d1,
      booking.id,
      ["pending_payment", "payment_submitted", "confirmed", "cancelled", "expired"],
      "refunded",
    );
  }
  return { bookingId: booking.id, bookingRefunded };
}

/** Record a payment received outside the website (cash, bank, or MoMo confirmed by phone). */
export async function recordManualPayment(
  db: Database,
  booking: BookingRow,
  input: z.output<typeof manualPaymentSchema>,
): Promise<PaymentRow> {
  if (["cancelled", "refunded"].includes(booking.status)) {
    throw new HttpError(409, "Payments cannot be recorded on a cancelled or refunded booking.");
  }
  const now = nowIso();
  try {
    const row = await db
      .insert(payments)
      .values({
        bookingId: booking.id,
        method: input.method,
        provider: "manual",
        transactionReference: input.transactionReference?.toUpperCase() ?? null,
        payerPhone: input.payerPhone,
        amount: input.amount,
        currency: booking.currency,
        paidAt: input.paidAt,
        status: "submitted",
        submittedAt: now,
        adminNotes: input.notes,
      })
      .returning()
      .get();
    // Recorded payments are no longer "pending" placeholders.
    await db.delete(payments).where(and(eq(payments.bookingId, booking.id), eq(payments.status, "pending")));
    if (booking.status === "pending_payment") {
      await db
        .update(bookings)
        .set({ status: "payment_submitted" })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, "pending_payment")));
    }
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateReference();
    throw err;
  }
}

export async function paymentsForBookings(db: Database, bookingIds: number[]) {
  if (!bookingIds.length) return [];
  return db.select().from(payments).where(inArray(payments.bookingId, bookingIds)).orderBy(desc(payments.createdAt));
}
