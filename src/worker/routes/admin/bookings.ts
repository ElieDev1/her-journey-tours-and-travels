import { Hono } from "hono";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { AppEnv } from "../../env";
import type { Database } from "../../db/client";
import { adminUsers, auditLogs, bookings, payments, tourDepartures, tours } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { HttpError, clientIp, notFound, paginate, parseId, parseJson, parseQuery } from "../../lib/http";
import {
  adminBookingListSchema,
  bookingCancelSchema,
  bookingNotesSchema,
  manualPaymentSchema,
} from "../../../shared/schemas";
import { BOOKING_STATUS_LABELS, type PaymentStatus } from "../../../shared/constants";
import { toMajor } from "../../../shared/money";
import type { AdminBookingDetailDTO, AdminBookingRowDTO } from "../../../shared/types";
import { audit } from "../../services/audit";
import {
  confirmBooking,
  expireStaleBookings,
  guestsOf,
  transitionReleasingSeats,
  verifiedTotalSql,
} from "../../services/bookings";
import { paymentToDTO, recordManualPayment } from "../../services/payments";
import { departureToDTO } from "../../services/tours";
import { auditToDTO } from "./audit";

export const adminBookingRoutes = new Hono<AppEnv>();
const canWrite = requirePermission("bookings:write");

const latestPaymentStatusSql = sql<PaymentStatus | null>`(SELECT p.status FROM payments p WHERE p.booking_id = ${bookings.id} ORDER BY p.created_at DESC, p.id DESC LIMIT 1)`;

function bookingFilters(q: z.output<typeof adminBookingListSchema>): SQL | undefined {
  const conds: SQL[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    conds.push(
      sql`(${bookings.reference} LIKE ${like} OR ${bookings.customerName} LIKE ${like} OR ${bookings.customerEmail} LIKE ${like} OR ${bookings.customerPhone} LIKE ${like})`,
    );
  }
  if (q.status) conds.push(eq(bookings.status, q.status));
  if (q.tourId) conds.push(eq(bookings.tourId, q.tourId));
  if (q.departureId) conds.push(eq(bookings.departureId, q.departureId));
  if (q.from) conds.push(gte(tourDepartures.startDate, q.from));
  if (q.to) conds.push(lte(tourDepartures.startDate, q.to));
  return conds.length ? and(...conds) : undefined;
}

export async function listBookingRows(
  db: Database,
  where: SQL | undefined,
  limit: number,
  offset: number,
): Promise<AdminBookingRowDTO[]> {
  const rows = await db
    .select({
      booking: bookings,
      tourTitle: tours.title,
      departureDate: tourDepartures.startDate,
      amountVerified: verifiedTotalSql,
      latestPaymentStatus: latestPaymentStatusSql,
    })
    .from(bookings)
    .innerJoin(tours, eq(bookings.tourId, tours.id))
    .innerJoin(tourDepartures, eq(bookings.departureId, tourDepartures.id))
    .where(where)
    .orderBy(desc(bookings.createdAt), desc(bookings.id))
    .limit(limit)
    .offset(offset);
  return rows.map(({ booking: b, ...r }) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    adults: b.adults,
    children: b.children,
    totalGuests: b.totalGuests,
    totalAmount: b.totalAmount,
    currency: b.currency,
    amountVerified: r.amountVerified,
    tourId: b.tourId,
    tourTitle: r.tourTitle,
    departureId: b.departureId,
    departureDate: r.departureDate,
    expiresAt: b.expiresAt,
    createdAt: b.createdAt,
    latestPaymentStatus: r.latestPaymentStatus,
  }));
}

adminBookingRoutes.get("/bookings", async (c) => {
  const db = c.get("db");
  await expireStaleBookings(db, c.env.DB);
  const q = parseQuery(c, adminBookingListSchema);
  const where = bookingFilters(q);
  const [items, count] = await Promise.all([
    listBookingRows(db, where, q.pageSize, (q.page - 1) * q.pageSize),
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .innerJoin(tourDepartures, eq(bookings.departureId, tourDepartures.id))
      .where(where)
      .get(),
  ]);
  return c.json(paginate(items, count?.n ?? 0, q.page, q.pageSize));
});

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

adminBookingRoutes.get("/bookings/export.csv", async (c) => {
  const db = c.get("db");
  const q = parseQuery(c, adminBookingListSchema);
  const rows = await listBookingRows(db, bookingFilters(q), 10_000, 0);
  const header = [
    "Reference", "Status", "Tour", "Departure date", "Customer", "Email", "Phone",
    "Adults", "Children", "Total guests", "Currency", "Total amount", "Verified paid",
    "Latest payment", "Created at",
  ];
  const lines = rows.map((r) =>
    [
      r.reference, BOOKING_STATUS_LABELS[r.status], r.tourTitle, r.departureDate, r.customerName,
      r.customerEmail, r.customerPhone, r.adults, r.children, r.totalGuests, r.currency,
      toMajor(r.totalAmount, r.currency), toMajor(r.amountVerified, r.currency),
      r.latestPaymentStatus ?? "", r.createdAt,
    ]
      .map(csvCell)
      .join(","),
  );
  await audit(db, { adminId: c.get("admin").id, action: "bookings.export", entityType: "booking", details: { count: rows.length, filters: q }, ip: clientIp(c) });
  const filename = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`\uFEFF${[header.join(","), ...lines].join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});

async function loadBooking(db: Database, id: number) {
  const booking = await db.select().from(bookings).where(eq(bookings.id, id)).get();
  if (!booking) throw notFound("Booking");
  return booking;
}

export async function loadBookingDetail(db: Database, id: number): Promise<AdminBookingDetailDTO> {
  const [row] = await listBookingRows(db, eq(bookings.id, id), 1, 0);
  if (!row) throw notFound("Booking");
  const booking = await loadBooking(db, id);
  const [guests, paymentRows, departure, history] = await Promise.all([
    guestsOf(db, id),
    db
      .select({ payment: payments, reviewer: adminUsers.name })
      .from(payments)
      .leftJoin(adminUsers, eq(payments.reviewedBy, adminUsers.id))
      .where(eq(payments.bookingId, id))
      .orderBy(desc(payments.createdAt)),
    db
      .select({ departure: tourDepartures, tour: tours })
      .from(tourDepartures)
      .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
      .where(eq(tourDepartures.id, booking.departureId))
      .get(),
    db
      .select({ log: auditLogs, adminName: adminUsers.name })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(auditLogs.adminId, adminUsers.id))
      .where(and(eq(auditLogs.entityType, "booking"), eq(auditLogs.entityId, String(id))))
      .orderBy(asc(auditLogs.createdAt)),
  ]);
  if (!departure) throw notFound("Departure");
  return {
    ...row,
    specialRequests: booking.specialRequests,
    adultUnitPrice: booking.adultUnitPrice,
    childUnitPrice: booking.childUnitPrice,
    discountAmount: booking.discountAmount,
    feesAmount: booking.feesAmount,
    seatsHeld: booking.seatsHeld,
    confirmedAt: booking.confirmedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    adminNotes: booking.adminNotes,
    updatedAt: booking.updatedAt,
    guests: guests.map((g) => ({ id: g.id, fullName: g.fullName, guestType: g.guestType, isLeadContact: g.isLeadContact })),
    payments: paymentRows.map((p) => paymentToDTO(p.payment, true, p.reviewer)),
    history: history.map((h) => auditToDTO(h.log, h.adminName)),
    departure: departureToDTO(departure.departure, departure.tour),
  };
}

adminBookingRoutes.get("/bookings/:id", async (c) => {
  return c.json(await loadBookingDetail(c.get("db"), parseId(c.req.param("id"), "Booking")));
});

adminBookingRoutes.post("/bookings/:id/confirm", canWrite, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Booking");
  const booking = await loadBooking(db, id);
  await confirmBooking(c.env.DB, booking);
  await audit(db, { adminId: c.get("admin").id, action: "booking.confirm", entityType: "booking", entityId: id, details: { from: booking.status }, ip: clientIp(c) });
  return c.json(await loadBookingDetail(db, id));
});

adminBookingRoutes.post("/bookings/:id/cancel", canWrite, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Booking");
  const { reason } = await parseJson(c, bookingCancelSchema);
  const booking = await loadBooking(db, id);
  const ok = await transitionReleasingSeats(
    c.env.DB,
    id,
    ["pending_payment", "payment_submitted", "confirmed", "expired"],
    "cancelled",
    { cancellationReason: reason },
  );
  if (!ok) throw new HttpError(409, `A ${booking.status.replace("_", " ")} booking cannot be cancelled.`);
  await audit(db, { adminId: c.get("admin").id, action: "booking.cancel", entityType: "booking", entityId: id, details: { from: booking.status, reason }, ip: clientIp(c) });
  return c.json(await loadBookingDetail(db, id));
});

adminBookingRoutes.patch("/bookings/:id/notes", canWrite, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Booking");
  const { adminNotes } = await parseJson(c, bookingNotesSchema);
  const row = await db.update(bookings).set({ adminNotes }).where(eq(bookings.id, id)).returning({ id: bookings.id }).get();
  if (!row) throw notFound("Booking");
  await audit(db, { adminId: c.get("admin").id, action: "booking.notes", entityType: "booking", entityId: id, ip: clientIp(c) });
  return c.json(await loadBookingDetail(db, id));
});

adminBookingRoutes.post("/bookings/:id/payments", requirePermission("payments:verify"), async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Booking");
  const input = await parseJson(c, manualPaymentSchema);
  const booking = await loadBooking(db, id);
  const payment = await recordManualPayment(db, booking, input);
  await audit(db, {
    adminId: c.get("admin").id,
    action: "payment.record",
    entityType: "booking",
    entityId: id,
    details: { paymentId: payment.id, method: input.method, amount: input.amount },
    ip: clientIp(c),
  });
  return c.json(await loadBookingDetail(db, id), 201);
});
