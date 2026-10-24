import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { bookings, customers, tourDepartures, tours } from "../db/schema";
import { HttpError, clientIp, parseJson } from "../lib/http";
import { sameOriginOnly } from "../middleware/security";
import {
  customerLoginSchema,
  customerPasswordChangeSchema,
  passwordForgotSchema,
  passwordResetSchema,
  customerProfileSchema,
  customerRegisterSchema,
} from "../../shared/schemas";
import type { CustomerBookingDTO } from "../../shared/types";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { enforceRateLimit } from "../services/rateLimit";
import { verifiedTotalSql } from "../services/bookings";
import { requestPasswordReset, resetPassword } from "../services/passwordReset";
import {
  currentCustomer,
  customerToDTO,
  endAllCustomerSessions,
  startCustomerSession,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  requireCustomer,
} from "../services/customerAuth";

/** Traveller accounts: sign up, log in, profile and "my bookings". */
export const accountRoutes = new Hono<AppEnv>();
accountRoutes.use("*", sameOriginOnly);

accountRoutes.get("/me", async (c) => {
  const customer = await currentCustomer(c, c.get("db"));
  return c.json({ customer: customer ? customerToDTO(customer) : null });
});

accountRoutes.post("/register", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `register:${clientIp(c)}`, 10, 3600);
  const input = await parseJson(c, customerRegisterSchema);
  const customer = await registerCustomer(c, db, input);
  return c.json({ customer: customerToDTO(customer) }, 201);
});

accountRoutes.post("/login", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `customer-login:${clientIp(c)}`, 20, 900);
  const { email, password } = await parseJson(c, customerLoginSchema);
  const customer = await loginCustomer(c, db, email, password);
  return c.json({ customer: customerToDTO(customer) });
});

accountRoutes.post("/logout", async (c) => {
  await logoutCustomer(c, c.get("db"));
  return c.json({ ok: true });
});

accountRoutes.put("/profile", async (c) => {
  const db = c.get("db");
  const me = await requireCustomer(c, db);
  const input = await parseJson(c, customerProfileSchema);
  const row = await db.update(customers).set(input).where(eq(customers.id, me.id)).returning().get();
  return c.json({ customer: customerToDTO(row!) });
});

accountRoutes.post("/password", async (c) => {
  const db = c.get("db");
  const me = await requireCustomer(c, db);
  await enforceRateLimit(db, `customer-password:${me.id}`, 5, 900);
  const input = await parseJson(c, customerPasswordChangeSchema);
  // Accounts created with Google have no password yet and may set one directly.
  if (me.passwordHash && !(await verifyPassword(input.currentPassword ?? "", me.passwordHash))) {
    throw new HttpError(400, "Your current password is incorrect", { currentPassword: "Incorrect password" });
  }
  await db.update(customers).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(customers.id, me.id));
  // End every session, then keep this device signed in with a fresh one.
  await endAllCustomerSessions(db, me.id);
  await startCustomerSession(c, db, me.id);
  return c.json({ ok: true });
});

accountRoutes.post("/password/forgot", async (c) => {
  const db = c.get("db");
  const ip = clientIp(c);
  await enforceRateLimit(db, `pw-forgot-ip:${ip}`, 10, 900);
  const { email } = await parseJson(c, passwordForgotSchema);
  // Per-address limit, keyed by a hash so addresses are not stored in plain text.
  await enforceRateLimit(db, `pw-forgot-email:${await sha256Hex(email)}`, 3, 3600);
  const origin = c.env.PUBLIC_SITE_URL || new URL(c.req.url).origin;
  // Sent in the background so the response time doesn't reveal whether the account exists.
  c.executionCtx.waitUntil(
    requestPasswordReset(c.env, db, email, origin.replace(/\/$/, ""), ip).catch((err) =>
      console.error("password_reset_request_failed", { error: String(err) }),
    ),
  );
  return c.json({ ok: true });
});

accountRoutes.post("/password/reset", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `pw-reset:${clientIp(c)}`, 10, 900);
  const { token, newPassword } = await parseJson(c, passwordResetSchema);
  await resetPassword(db, token, newPassword);
  return c.json({ ok: true });
});

accountRoutes.get("/bookings", async (c) => {
  const db = c.get("db");
  const me = await requireCustomer(c, db);
  const rows = await db
    .select({
      booking: bookings,
      tourTitle: tours.title,
      tourSlug: tours.slug,
      departureDate: tourDepartures.startDate,
      amountPaid: verifiedTotalSql,
    })
    .from(bookings)
    .innerJoin(tours, eq(bookings.tourId, tours.id))
    .innerJoin(tourDepartures, eq(bookings.departureId, tourDepartures.id))
    .where(eq(bookings.customerId, me.id))
    .orderBy(desc(bookings.createdAt))
    .limit(200);
  const items: CustomerBookingDTO[] = rows.map((r) => ({
    reference: r.booking.reference,
    status: r.booking.status,
    tourTitle: r.tourTitle,
    tourSlug: r.tourSlug,
    departureDate: r.departureDate,
    totalGuests: r.booking.totalGuests,
    totalAmount: r.booking.totalAmount,
    currency: r.booking.currency,
    amountPaid: r.amountPaid,
    bookingEmail: r.booking.customerEmail,
    createdAt: r.booking.createdAt,
  }));
  return c.json({ items });
});
