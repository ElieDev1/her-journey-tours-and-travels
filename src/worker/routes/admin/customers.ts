import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { AppEnv } from "../../env";
import type { Database } from "../../db/client";
import { adminUsers, auditLogs, bookings, customers, passwordResetTokens, payments, tourDepartures, tours } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { HttpError, clientIp, notFound, paginate, parseId, parseJson, parseQuery } from "../../lib/http";
import { adminCustomerListSchema, customerDisableSchema } from "../../../shared/schemas";
import type { AdminCustomerDetailDTO, AdminCustomerRowDTO, AdminPaymentRowDTO } from "../../../shared/types";
import { nowIso } from "../../../shared/time";
import { audit } from "../../services/audit";
import { endAllCustomerSessions } from "../../services/customerAuth";
import { paymentToDTO } from "../../services/payments";
import { auditToDTO } from "./audit";
import { listBookingRows } from "./bookings";

/** Traveller accounts ("Users" in the dashboard). Admin accounts live in users.ts. */
export const adminCustomerRoutes = new Hono<AppEnv>();
const canManage = requirePermission("customers:manage");

const bookingCountSql = sql<number>`(SELECT count(*) FROM bookings b WHERE b.customer_id = ${customers.id})`;

function filters(q: z.output<typeof adminCustomerListSchema>): SQL | undefined {
  const conds: SQL[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    conds.push(sql`(${customers.fullName} LIKE ${like} OR ${customers.email} LIKE ${like} OR ${customers.phone} LIKE ${like})`);
  }
  if (q.status === "active") conds.push(isNull(customers.disabledAt));
  if (q.status === "disabled") conds.push(isNotNull(customers.disabledAt));
  if (q.method === "google") conds.push(isNotNull(customers.googleSub));
  if (q.method === "password") conds.push(ne(customers.passwordHash, ""));
  return conds.length ? and(...conds) : undefined;
}

async function listRows(db: Database, where: SQL | undefined, limit: number, offset: number): Promise<AdminCustomerRowDTO[]> {
  const rows = await db
    .select({ customer: customers, bookingCount: bookingCountSql })
    .from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .limit(limit)
    .offset(offset);
  return rows.map(({ customer: u, bookingCount }) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    hasPassword: u.passwordHash !== "",
    hasGoogle: u.googleSub !== null,
    emailVerified: u.emailVerifiedAt !== null,
    disabledAt: u.disabledAt,
    disabledReason: u.disabledReason,
    bookingCount,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }));
}

adminCustomerRoutes.get("/customers", async (c) => {
  const db = c.get("db");
  const q = parseQuery(c, adminCustomerListSchema);
  const where = filters(q);
  const [items, count] = await Promise.all([
    listRows(db, where, q.pageSize, (q.page - 1) * q.pageSize),
    db.select({ n: sql<number>`count(*)` }).from(customers).where(where).get(),
  ]);
  return c.json(paginate(items, count?.n ?? 0, q.page, q.pageSize));
});

function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

adminCustomerRoutes.get("/customers/export.csv", canManage, async (c) => {
  const db = c.get("db");
  const q = parseQuery(c, adminCustomerListSchema);
  const rows = await listRows(db, filters(q), 20_000, 0);
  const header = ["Name", "Email", "Phone", "Sign-in methods", "Email verified", "Status", "Bookings", "Last sign-in", "Created"];
  const lines = rows.map((r) =>
    [
      r.fullName,
      r.email,
      r.phone ?? "",
      [r.hasPassword && "password", r.hasGoogle && "google"].filter(Boolean).join(" + "),
      r.emailVerified ? "yes" : "no",
      r.disabledAt ? "disabled" : "active",
      r.bookingCount,
      r.lastLoginAt ?? "",
      r.createdAt,
    ]
      .map(csvCell)
      .join(","),
  );
  await audit(db, { adminId: c.get("admin").id, action: "customers.export", entityType: "customer", details: { count: rows.length, filters: q }, ip: clientIp(c) });
  return new Response(`\uFEFF${[header.join(","), ...lines].join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});

async function loadDetail(db: Database, id: number): Promise<AdminCustomerDetailDTO> {
  const [row] = await listRows(db, eq(customers.id, id), 1, 0);
  if (!row) throw notFound("User");
  const [bookingRows, paymentRows, history] = await Promise.all([
    listBookingRows(db, eq(bookings.customerId, id), 200, 0),
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
      .where(and(eq(bookings.customerId, id), ne(payments.status, "pending")))
      .orderBy(desc(payments.createdAt))
      .limit(200),
    db
      .select({ log: auditLogs, adminName: adminUsers.name })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(auditLogs.adminId, adminUsers.id))
      .where(and(eq(auditLogs.entityType, "customer"), eq(auditLogs.entityId, String(id))))
      .orderBy(asc(auditLogs.createdAt)),
  ]);
  const paymentDtos: AdminPaymentRowDTO[] = paymentRows.map((r) => ({
    ...paymentToDTO(r.payment, true, r.reviewer),
    bookingReference: r.bookingReference,
    bookingStatus: r.bookingStatus,
    bookingTotal: r.bookingTotal,
    customerName: r.customerName,
    tourTitle: r.tourTitle,
    departureDate: r.departureDate,
  }));
  return { ...row, bookings: bookingRows, payments: paymentDtos, history: history.map((h) => auditToDTO(h.log, h.adminName)) };
}

adminCustomerRoutes.get("/customers/:id", async (c) => {
  return c.json(await loadDetail(c.get("db"), parseId(c.req.param("id"), "User")));
});

adminCustomerRoutes.post("/customers/:id/disable", canManage, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "User");
  const { reason } = await parseJson(c, customerDisableSchema);
  const updated = await db
    .update(customers)
    .set({ disabledAt: nowIso(), disabledReason: reason })
    .where(and(eq(customers.id, id), isNull(customers.disabledAt)))
    .returning({ id: customers.id })
    .get();
  if (!updated) {
    const exists = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).get();
    throw exists ? new HttpError(409, "This account is already disabled.") : notFound("User");
  }
  // Sign the user out everywhere and void any pending password reset link.
  await endAllCustomerSessions(db, id);
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.customerId, id));
  await audit(db, { adminId: c.get("admin").id, action: "customer.disable", entityType: "customer", entityId: id, details: { reason }, ip: clientIp(c) });
  return c.json(await loadDetail(db, id));
});

adminCustomerRoutes.post("/customers/:id/enable", canManage, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "User");
  const updated = await db
    .update(customers)
    .set({ disabledAt: null, disabledReason: null, failedLoginCount: 0, lockedUntil: null })
    .where(and(eq(customers.id, id), isNotNull(customers.disabledAt)))
    .returning({ id: customers.id })
    .get();
  if (!updated) {
    const exists = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).get();
    throw exists ? new HttpError(409, "This account is already active.") : notFound("User");
  }
  await audit(db, { adminId: c.get("admin").id, action: "customer.enable", entityType: "customer", entityId: id, ip: clientIp(c) });
  return c.json(await loadDetail(db, id));
});
