import { and, eq, gt, lt } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Database } from "../db/client";
import { customerSessions, customers } from "../db/schema";
import type { AppEnv } from "../env";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../lib/crypto";
import { HttpError } from "../lib/http";
import { nowIso } from "../../shared/time";
import type { CustomerDTO } from "../../shared/types";

export type CustomerRow = typeof customers.$inferSelect;

const SESSION_MS = 30 * 24 * 3_600_000;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60_000;
let dummyHash: Promise<string> | null = null;

function cookieName(c: Context<AppEnv>): string {
  return c.env.APP_ENV === "development" ? "hj_session" : "__Host-hj_session";
}

export function customerToDTO(u: CustomerRow): CustomerDTO {
  return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, createdAt: u.createdAt };
}

/** Start a session for a customer and set the session cookie. */
export async function startCustomerSession(c: Context<AppEnv>, db: Database, customerId: number): Promise<void> {
  const token = randomToken(32);
  await db.insert(customerSessions).values({
    customerId,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
  });
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    // Lax so the session survives following a link to the site.
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function registerCustomer(
  c: Context<AppEnv>,
  db: Database,
  input: { fullName: string; email: string; phone: string | null; password: string },
): Promise<CustomerRow> {
  const exists = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, input.email)).get();
  if (exists) {
    throw new HttpError(409, "An account with this email already exists. Log in instead.", { email: "Already registered" });
  }
  const row = await db
    .insert(customers)
    .values({ fullName: input.fullName, email: input.email, phone: input.phone, passwordHash: await hashPassword(input.password) })
    .returning()
    .get();
  await startCustomerSession(c, db, row.id);
  return row;
}

export async function loginCustomer(c: Context<AppEnv>, db: Database, email: string, password: string): Promise<CustomerRow> {
  const user = await db.select().from(customers).where(eq(customers.email, email)).get();
  const invalid = new HttpError(401, "Incorrect email or password");
  if (!user) {
    dummyHash ??= hashPassword("timing-equaliser-password");
    await verifyPassword(password, await dummyHash);
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > nowIso()) {
    throw new HttpError(423, "Too many failed attempts. Please try again in 15 minutes.");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failures = user.failedLoginCount + 1;
    await db
      .update(customers)
      .set({
        failedLoginCount: failures >= MAX_FAILED_LOGINS ? 0 : failures,
        lockedUntil: failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : user.lockedUntil,
      })
      .where(eq(customers.id, user.id));
    throw invalid;
  }
  await db.update(customers).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: nowIso() }).where(eq(customers.id, user.id));
  await startCustomerSession(c, db, user.id);
  return user;
}

export async function logoutCustomer(c: Context<AppEnv>, db: Database): Promise<void> {
  const token = getCookie(c, cookieName(c));
  if (token) await db.delete(customerSessions).where(eq(customerSessions.tokenHash, await sha256Hex(token)));
  deleteCookie(c, cookieName(c), { path: "/", secure: c.env.APP_ENV !== "development" });
}

/** The signed-in customer, or null. Never throws for a missing/expired session. */
export async function currentCustomer(c: Context<AppEnv>, db: Database): Promise<CustomerRow | null> {
  const token = getCookie(c, cookieName(c));
  if (!token || token.length > 100) return null;
  const row = await db
    .select({ customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customerSessions.customerId, customers.id))
    .where(and(eq(customerSessions.tokenHash, await sha256Hex(token)), gt(customerSessions.expiresAt, nowIso())))
    .get();
  return row?.customer ?? null;
}

export async function requireCustomer(c: Context<AppEnv>, db: Database): Promise<CustomerRow> {
  const customer = await currentCustomer(c, db);
  if (!customer) throw new HttpError(401, "Please log in to continue");
  return customer;
}

export async function pruneCustomerSessions(db: Database): Promise<void> {
  await db.delete(customerSessions).where(lt(customerSessions.expiresAt, nowIso()));
}
