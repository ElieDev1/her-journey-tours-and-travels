import { Hono } from "hono";
import { and, desc, eq, ne } from "drizzle-orm";
import type { AppEnv } from "../env";
import { bookings, customerSessions, customers, tourDepartures, tours } from "../db/schema";
import { HttpError, clientIp, parseJson } from "../lib/http";
import { sameOriginOnly } from "../middleware/security";
import {
  customerLoginSchema,
  customerPasswordChangeSchema,
  customerProfileSchema,
  customerRegisterSchema,
} from "../../shared/schemas";
import type { CustomerBookingDTO } from "../../shared/types";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { enforceRateLimit } from "../services/rateLimit";
import { verifiedTotalSql } from "../services/bookings";
import {
  currentCustomer,
  customerToDTO,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  requireCustomer,
} from "../services/customerAuth";
import { getCookie } from "hono/cookie";

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
  if (!(await verifyPassword(input.currentPassword, me.passwordHash))) {
    throw new HttpError(400, "Your current password is incorrect", { currentPassword: "Incorrect password" });
  }
  await db.update(customers).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(customers.id, me.id));
  // Sign out every other device.
  const name = c.env.APP_ENV === "development" ? "hj_session" : "__Host-hj_session";
  const token = getCookie(c, name) ?? "";
  await db
    .delete(customerSessions)
    .where(and(eq(customerSessions.customerId, me.id), ne(customerSessions.tokenHash, await sha256Hex(token))));
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
