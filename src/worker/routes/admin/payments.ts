import { Hono } from "hono";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AppEnv } from "../../env";
import { adminUsers, bookings, payments, tourDepartures, tours } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { clientIp, paginate, parseId, parseJson, parseQuery } from "../../lib/http";
import { paymentListSchema, paymentRefundSchema, paymentRejectSchema, paymentVerifySchema } from "../../../shared/schemas";
import type { AdminPaymentRowDTO } from "../../../shared/types";
import { audit } from "../../services/audit";
import { paymentToDTO, refundPayment, rejectPayment, verifyPayment } from "../../services/payments";
import { loadSettings, toPublicSettings } from "../../services/settings";
import { sendEmail } from "../../services/email";
import { loadBookingDetail } from "./bookings";
import { formatMoney } from "../../../shared/money";

export const adminPaymentRoutes = new Hono<AppEnv>();

adminPaymentRoutes.get("/payments", async (c) => {
  const db = c.get("db");
  const q = parseQuery(c, paymentListSchema);
  // Placeholders for unpaid bookings are not payments yet.
  const conds: SQL[] = [q.status ? eq(payments.status, q.status) : sql`${payments.status} <> 'pending'`];
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    conds.push(
      sql`(${payments.transactionReference} LIKE ${like} OR ${bookings.reference} LIKE ${like} OR ${bookings.customerName} LIKE ${like} OR ${payments.payerPhone} LIKE ${like})`,
    );
  }
  const where = and(...conds);
  const [rows, count] = await Promise.all([
    db
      .select({
        payment: payments,
        reviewer: adminUsers.name,
        bookingReference: bookings.reference,
        bookingStatus: bookings.status,
        bookingTotal: bookings.totalAmount,
        customerName: bookings.customerName,
        tourTitle: tours.title,
        departureDate: tourDepartures.startDate,
      })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .innerJoin(tours, eq(bookings.tourId, tours.id))
      .innerJoin(tourDepartures, eq(bookings.departureId, tourDepartures.id))
      .leftJoin(adminUsers, eq(payments.reviewedBy, adminUsers.id))
      .where(where)
      .orderBy(sql`CASE ${payments.status} WHEN 'submitted' THEN 0 ELSE 1 END`, desc(payments.submittedAt), desc(payments.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ n: sql<number>`count(*)` })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .where(where)
      .get(),
  ]);
  const items: AdminPaymentRowDTO[] = rows.map((r) => ({
    ...paymentToDTO(r.payment, true, r.reviewer),
    bookingReference: r.bookingReference,
    bookingStatus: r.bookingStatus,
    bookingTotal: r.bookingTotal,
    customerName: r.customerName,
    tourTitle: r.tourTitle,
    departureDate: r.departureDate,
  }));
  return c.json(paginate(items, count?.n ?? 0, q.page, q.pageSize));
});

adminPaymentRoutes.get("/payments/summary", async (c) => {
  const db = c.get("db");
  const [revenue, refunds, statusCounts] = await Promise.all([
    db
      .select({ currency: payments.currency, amount: sql<number>`SUM(${payments.amount})` })
      .from(payments)
      .where(eq(payments.status, "verified"))
      .groupBy(payments.currency),
    db
      .select({ currency: payments.currency, amount: sql<number>`SUM(COALESCE(${payments.refundAmount}, 0))` })
      .from(payments)
      .where(eq(payments.status, "refunded"))
      .groupBy(payments.currency),
    db
      .select({ status: payments.status, n: sql<number>`count(*)` })
      .from(payments)
      .groupBy(payments.status),
  ]);
  return c.json({ revenue, refunds, statusCounts });
});

adminPaymentRoutes.post("/payments/:id/verify", requirePermission("payments:verify"), async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Payment");
  const { notes } = await parseJson(c, paymentVerifySchema);
  const result = await verifyPayment(db, c.env.DB, id, admin.id, notes);
  await audit(db, { adminId: admin.id, action: "payment.verify", entityType: "booking", entityId: result.bookingId, details: { paymentId: id, bookingConfirmed: result.bookingConfirmed }, ip: clientIp(c) });

  const booking = await loadBookingDetail(db, result.bookingId);
  if (result.bookingConfirmed) {
    const settings = toPublicSettings(await loadSettings(db));
    c.executionCtx.waitUntil(
      sendEmail(c.env, {
        to: booking.customerEmail,
        subject: `Booking ${booking.reference} confirmed – ${booking.tourTitle}`,
        text: `Hello ${booking.customerName},\n\nWe have received your payment of ${formatMoney(booking.amountVerified, booking.currency)} and your booking ${booking.reference} for ${booking.tourTitle} on ${booking.departureDate} is confirmed.\n\nSee you soon!\n${settings.companyName}`,
      }),
    );
  }
  return c.json({ message: result.message, bookingConfirmed: result.bookingConfirmed, booking });
});

adminPaymentRoutes.post("/payments/:id/reject", requirePermission("payments:verify"), async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Payment");
  const { reason } = await parseJson(c, paymentRejectSchema);
  const settings = toPublicSettings(await loadSettings(db));
  const { bookingId } = await rejectPayment(db, id, admin.id, reason, settings.bookingHoldMinutes);
  await audit(db, { adminId: admin.id, action: "payment.reject", entityType: "booking", entityId: bookingId, details: { paymentId: id, reason }, ip: clientIp(c) });
  return c.json({ message: "Payment rejected. The customer can submit a corrected payment.", booking: await loadBookingDetail(db, bookingId) });
});

adminPaymentRoutes.post("/payments/:id/refund", requirePermission("payments:refund"), async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Payment");
  const input = await parseJson(c, paymentRefundSchema);
  const { bookingId, bookingRefunded } = await refundPayment(db, c.env.DB, id, admin.id, input);
  await audit(db, { adminId: admin.id, action: "payment.refund", entityType: "booking", entityId: bookingId, details: { paymentId: id, amount: input.amount, refundReference: input.refundReference, bookingRefunded }, ip: clientIp(c) });
  return c.json({
    message: bookingRefunded ? "Refund recorded and the booking marked as refunded." : "Refund recorded.",
    booking: await loadBookingDetail(db, bookingId),
  });
});
