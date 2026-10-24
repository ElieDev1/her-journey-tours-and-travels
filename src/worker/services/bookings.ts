import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { bookingGuests, bookings, payments, tourDepartures, tours } from "../db/schema";
import type { BookingStatus } from "../../shared/constants";
import { calculateQuote } from "../../shared/pricing";
import type { z } from "zod";
import type { bookingCreateSchema } from "../../shared/schemas";
import type { PaymentInstructionsDTO, PublicBookingDTO } from "../../shared/types";
import { addMinutes, formatDate, formatTime, nowIso } from "../../shared/time";
import { formatMoney } from "../../shared/money";
import { bookingReference, randomToken, safeEqual, sha256Hex } from "../lib/crypto";
import { HttpError, isUniqueViolation, notFound } from "../lib/http";
import { bookingCutoff, departureToDTO, priceInputsFor } from "./tours";
import { paymentToDTO } from "./payments";
import type { PublicSettingsDTO } from "../../shared/types";

export type BookingRow = typeof bookings.$inferSelect;
type BookingCreate = z.output<typeof bookingCreateSchema>;

// ---------- seat-safe state transitions ----------

/**
 * Move a booking to `next` if it is currently in one of `from`, releasing its
 * seats in the same transaction when it holds them. Returns false when the
 * booking was not in an allowed status (e.g. a concurrent update won).
 */
export async function transitionReleasingSeats(
  d1: D1Database,
  bookingId: number,
  from: readonly BookingStatus[],
  next: BookingStatus,
  extra: { cancellationReason?: string | null } = {},
): Promise<boolean> {
  const placeholders = from.map(() => "?").join(", ");
  const now = nowIso();
  const release = d1
    .prepare(
      `UPDATE tour_departures
         SET seats_reserved = MAX(seats_reserved - (SELECT total_guests FROM bookings WHERE id = ?), 0),
             updated_at = ?
       WHERE id = (SELECT departure_id FROM bookings WHERE id = ?)
         AND EXISTS (SELECT 1 FROM bookings WHERE id = ? AND seats_held = 1 AND status IN (${placeholders}))`,
    )
    .bind(bookingId, now, bookingId, bookingId, ...from);
  const update = d1
    .prepare(
      `UPDATE bookings
         SET status = ?, seats_held = 0, updated_at = ?,
             cancelled_at = CASE WHEN ? IN ('cancelled', 'refunded') THEN ? ELSE cancelled_at END,
             cancellation_reason = COALESCE(?, cancellation_reason)
       WHERE id = ? AND status IN (${placeholders})`,
    )
    .bind(next, now, next, now, extra.cancellationReason ?? null, bookingId, ...from);
  // Unsubmitted payment placeholders are meaningless once seats are released.
  const dropPending = d1
    .prepare(
      `DELETE FROM payments WHERE booking_id = ? AND status = 'pending'
         AND EXISTS (SELECT 1 FROM bookings WHERE id = ? AND status = ?)`,
    )
    .bind(bookingId, bookingId, next);
  const [, updated] = await d1.batch([release, update, dropPending]);
  return (updated?.meta.changes ?? 0) === 1;
}

/** Reserve seats again for a booking that expired (e.g. a late payment arrived). */
async function reholdSeats(d1: D1Database, booking: BookingRow, nextStatus: BookingStatus): Promise<boolean> {
  const now = nowIso();
  const reserve = await d1
    .prepare(
      `UPDATE tour_departures SET seats_reserved = seats_reserved + ?, updated_at = ?
       WHERE id = ? AND status = 'scheduled'
         AND (seat_capacity IS NULL OR seats_reserved + ? <= seat_capacity)`,
    )
    .bind(booking.totalGuests, now, booking.departureId, booking.totalGuests)
    .run();
  if (reserve.meta.changes !== 1) return false;
  const update = await d1
    .prepare(
      `UPDATE bookings SET status = ?, seats_held = 1, updated_at = ?,
              confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_at END
       WHERE id = ? AND status = 'expired' AND seats_held = 0`,
    )
    .bind(nextStatus, now, nextStatus, now, booking.id)
    .run();
  if (update.meta.changes !== 1) {
    // Someone else changed the booking; give the seats back.
    await d1
      .prepare(`UPDATE tour_departures SET seats_reserved = MAX(seats_reserved - ?, 0) WHERE id = ?`)
      .bind(booking.totalGuests, booking.departureId)
      .run();
    return false;
  }
  return true;
}

/** Confirm a booking. Expired bookings are revived only if seats are still free. */
export async function confirmBooking(d1: D1Database, booking: BookingRow): Promise<void> {
  if (booking.status === "confirmed") return;
  if (booking.status === "expired") {
    if (!(await reholdSeats(d1, booking, "confirmed"))) {
      throw new HttpError(409, "This booking expired and there are no longer enough seats on the departure.");
    }
    return;
  }
  if (booking.status !== "pending_payment" && booking.status !== "payment_submitted") {
    throw new HttpError(409, `A ${booking.status.replace("_", " ")} booking cannot be confirmed.`);
  }
  const now = nowIso();
  const res = await d1
    .prepare(
      `UPDATE bookings SET status = 'confirmed', confirmed_at = ?, expires_at = NULL, updated_at = ?
       WHERE id = ? AND status IN ('pending_payment', 'payment_submitted')`,
    )
    .bind(now, now, booking.id)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(409, "The booking changed while you were working. Refresh and try again.");
}

/** Expire unpaid bookings whose payment window has passed, releasing their seats. */
export async function expireStaleBookings(db: Database, d1: D1Database, limit = 200): Promise<number> {
  const stale = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.status, "pending_payment"), lt(bookings.expiresAt, nowIso())))
    .orderBy(asc(bookings.expiresAt))
    .limit(limit);
  let expired = 0;
  for (const { id } of stale) {
    if (await transitionReleasingSeats(d1, id, ["pending_payment"], "expired")) expired++;
  }
  return expired;
}

// ---------- creation ----------

export async function createBooking(
  db: Database,
  d1: D1Database,
  input: BookingCreate,
  holdMinutes: number,
  merchantCode: string,
  customerId: number | null = null,
): Promise<{ booking: BookingRow; accessToken: string }> {
  const row = await db
    .select({ departure: tourDepartures, tour: tours })
    .from(tourDepartures)
    .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
    .where(eq(tourDepartures.id, input.departureId))
    .get();
  if (!row) throw new HttpError(404, "The selected departure date was not found");
  const { departure, tour } = row;

  const dto = departureToDTO(departure, tour);
  if (!dto.bookable) throw new HttpError(409, dto.unavailableReason ?? "This departure cannot be booked");

  const totalGuests = input.adults + input.children;
  if (tour.maxGroupSize && totalGuests > tour.maxGroupSize) {
    throw new HttpError(400, `A single booking can include at most ${tour.maxGroupSize} guests.`, {
      adults: `Maximum ${tour.maxGroupSize} guests per booking`,
    });
  }
  if (dto.seatsAvailable !== null && totalGuests > dto.seatsAvailable) {
    throw new HttpError(409, `Only ${dto.seatsAvailable} seat${dto.seatsAvailable === 1 ? "" : "s"} left on this date.`);
  }

  const quote = calculateQuote(priceInputsFor(tour, departure), input.adults, input.children);
  const now = new Date();
  const cutoff = bookingCutoff(departure, tour);
  const holdUntil = addMinutes(now, holdMinutes).toISOString();
  const expiresAt = holdUntil < cutoff ? holdUntil : cutoff;
  const accessToken = randomToken(24);
  const tokenHash = await sha256Hex(accessToken);
  const createdAt = now.toISOString();

  const guestNames = input.guestNames.filter(Boolean);
  const guests: Array<{ name: string; type: "adult" | "child"; lead: boolean }> = [
    { name: input.customerName, type: input.adults > 0 ? "adult" : "child", lead: true },
  ];
  for (let i = 0; i < guestNames.length && guests.length < totalGuests; i++) {
    guests.push({ name: guestNames[i]!, type: guests.length < input.adults ? "adult" : "child", lead: false });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = bookingReference();
    // 1) Insert the booking only if the departure still has room.
    const insertBooking = d1
      .prepare(
        `INSERT INTO bookings (reference, access_token_hash, tour_id, departure_id, customer_id, customer_name, customer_email,
            customer_phone, adults, children, total_guests, special_requests, currency, adult_unit_price,
            child_unit_price, discount_amount, fees_amount, total_amount, status, seats_held, expires_at,
            created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 1, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM tour_departures
           WHERE id = ? AND status = 'scheduled'
             AND (seat_capacity IS NULL OR seats_reserved + ? <= seat_capacity))`,
      )
      .bind(
        reference, tokenHash, tour.id, departure.id, customerId, input.customerName, input.customerEmail,
        input.customerPhone, input.adults, input.children, totalGuests, input.specialRequests,
        quote.currency, quote.adultUnitPrice, quote.childUnitPrice, quote.discountAmount,
        quote.feesAmount, quote.totalAmount, expiresAt, createdAt, createdAt,
        departure.id, totalGuests,
      );
    // 2) Reserve the seats only if that booking row now exists.
    const reserveSeats = d1
      .prepare(
        `UPDATE tour_departures SET seats_reserved = seats_reserved + ?, updated_at = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM bookings WHERE reference = ?)`,
      )
      .bind(totalGuests, createdAt, departure.id, reference);
    const insertGuests = guests.map((g) =>
      d1
        .prepare(
          `INSERT INTO booking_guests (booking_id, full_name, guest_type, is_lead_contact)
           SELECT id, ?, ?, ? FROM bookings WHERE reference = ?`,
        )
        .bind(g.name, g.type, g.lead ? 1 : 0, reference),
    );
    // 3) The amount due, awaiting the customer's payment details.
    const insertPayment = d1
      .prepare(
        `INSERT INTO payments (booking_id, method, provider, merchant_code, amount, currency, status)
         SELECT id, 'momo_pay', 'manual', ?, total_amount, currency, 'pending' FROM bookings WHERE reference = ?`,
      )
      .bind(merchantCode, reference);

    try {
      const [inserted] = await d1.batch([insertBooking, reserveSeats, ...insertGuests, insertPayment]);
      if ((inserted?.meta.changes ?? 0) !== 1) {
        throw new HttpError(409, "Sorry, there are no longer enough seats on this date. Please choose fewer guests or another date.");
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (isUniqueViolation(err, "bookings.reference")) continue; // retry with a new reference
      throw err;
    }
    const booking = await db.select().from(bookings).where(eq(bookings.reference, reference)).get();
    if (!booking) throw new Error("Booking vanished after insert");
    return { booking, accessToken };
  }
  throw new Error("Could not allocate a unique booking reference");
}

// ---------- customer access ----------

export async function findBookingForCustomer(
  db: Database,
  reference: string,
  credential: { token?: string | undefined; email?: string | undefined },
): Promise<BookingRow> {
  const booking = await db.select().from(bookings).where(eq(bookings.reference, reference.toUpperCase())).get();
  // Same error whether the booking is missing or the credential is wrong.
  const denied = notFound("Booking");
  if (!booking) throw denied;
  if (credential.token) {
    if (!safeEqual(await sha256Hex(credential.token), booking.accessTokenHash)) throw denied;
  } else if (!credential.email || credential.email.toLowerCase() !== booking.customerEmail.toLowerCase()) {
    throw denied;
  }
  return booking;
}

export function paymentInstructions(
  settings: PublicSettingsDTO,
  booking: Pick<BookingRow, "reference" | "currency" | "expiresAt">,
  amountDue: number,
): PaymentInstructionsDTO {
  const amount = formatMoney(amountDue, booking.currency);
  return {
    merchantName: settings.momoMerchantName,
    momoPayCode: settings.momoPayCode,
    amountDue,
    currency: booking.currency,
    deadline: booking.expiresAt,
    steps: [
      `On your MTN Mobile Money line dial *182*8*1*${settings.momoPayCode}#, or open the MoMo app and choose "MoMo Pay".`,
      `Check that the merchant shown is ${settings.momoMerchantName} (MoMo Pay code ${settings.momoPayCode}).`,
      `Enter the amount: ${amount}.`,
      `Confirm with your MoMo PIN and keep the SMS confirmation.`,
      `Submit the transaction ID from the SMS below, quoting booking reference ${booking.reference}.`,
    ],
  };
}

export async function toPublicBooking(db: Database, booking: BookingRow, settings: PublicSettingsDTO): Promise<PublicBookingDTO> {
  const [row, paymentRows] = await Promise.all([
    db
      .select({ tour: tours, departure: tourDepartures })
      .from(tourDepartures)
      .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
      .where(eq(tourDepartures.id, booking.departureId))
      .get(),
    db.select().from(payments).where(eq(payments.bookingId, booking.id)).orderBy(desc(payments.createdAt)),
  ]);
  if (!row) throw notFound("Booking");
  const { tour, departure } = row;

  const amountPaid = paymentRows
    .filter((p) => p.status === "verified")
    .reduce((sum, p) => sum + p.amount, 0);
  const amountDue = Math.max(booking.totalAmount - amountPaid, 0);
  const visiblePayments = paymentRows.filter((p) => p.status !== "pending");

  return {
    reference: booking.reference,
    status: booking.status,
    tour: {
      title: tour.title,
      slug: tour.slug,
      destination: tour.destination,
      pickupLocation: tour.pickupLocation,
      meetingPoint: tour.meetingPoint,
    },
    departure: {
      startDate: departure.startDate,
      endDate: departure.endDate,
      departureTime: departure.departureTime ?? tour.departureTime,
      returnTime: departure.returnTime ?? tour.returnTime,
    },
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    adults: booking.adults,
    children: booking.children,
    totalGuests: booking.totalGuests,
    specialRequests: booking.specialRequests,
    currency: booking.currency,
    adultUnitPrice: booking.adultUnitPrice,
    childUnitPrice: booking.childUnitPrice,
    discountAmount: booking.discountAmount,
    feesAmount: booking.feesAmount,
    totalAmount: booking.totalAmount,
    amountPaid,
    expiresAt: booking.expiresAt,
    confirmedAt: booking.confirmedAt,
    createdAt: booking.createdAt,
    payments: visiblePayments.map((p) => paymentToDTO(p, false)),
    paymentInstructions: paymentInstructions(settings, booking, amountDue),
    contact: {
      phone: tour.bookingPhone ?? settings.phonePrimary,
      altPhone: tour.alternativePhone ?? settings.phoneSecondary,
      whatsapp: tour.whatsappNumber ?? settings.whatsappNumber,
      email: tour.bookingEmail ?? settings.contactEmail,
    },
    canSubmitPayment:
      ["pending_payment", "payment_submitted", "expired"].includes(booking.status) && amountDue > 0,
  };
}

export function bookingCreatedEmail(b: PublicBookingDTO, link: string): { subject: string; text: string } {
  const p = b.paymentInstructions;
  const when = `${formatDate(b.departure.startDate, true)}${b.departure.departureTime ? ` at ${formatTime(b.departure.departureTime)}` : ""}`;
  return {
    subject: `Booking ${b.reference} received – ${b.tour.title}`,
    text: [
      `Hello ${b.customerName},`,
      ``,
      `Thank you for booking ${b.tour.title} on ${when}.`,
      `Booking reference: ${b.reference}`,
      `Guests: ${b.adults} adult(s), ${b.children} child(ren)`,
      `Amount payable: ${formatMoney(b.totalAmount, b.currency)}`,
      ``,
      `Pay with MoMo Pay code ${p.momoPayCode} (${p.merchantName}) and submit your transaction ID here:`,
      link,
      ``,
      p.deadline ? `Please pay before ${new Date(p.deadline).toUTCString()} to keep your seats.` : ``,
      `Your booking is confirmed once we verify your payment.`,
    ].join("\n"),
  };
}

export async function guestsOf(db: Database, bookingId: number) {
  return db.select().from(bookingGuests).where(eq(bookingGuests.bookingId, bookingId)).orderBy(asc(bookingGuests.id));
}

export async function bookingsByIds(db: Database, ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(bookings).where(inArray(bookings.id, ids));
}

export const verifiedTotalSql = sql<number>`COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.booking_id = ${bookings.id} AND p.status = 'verified'), 0)`;
