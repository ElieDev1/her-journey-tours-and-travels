import { and, eq, gt, lt, ne } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Database } from "../db/client";
import { adminSessions, adminUsers } from "../db/schema";
import type { AppEnv } from "../env";
import { hashPassword, randomToken, sha256Hex, verifyPassword } from "../lib/crypto";
import { HttpError, clientIp } from "../lib/http";
import { nowIso } from "../../shared/time";
import type { AdminUserDTO } from "../../shared/types";

const SESSION_ABSOLUTE_MS = 12 * 3_600_000;
const SESSION_IDLE_MS = 2 * 3_600_000;
const TOUCH_INTERVAL_MS = 5 * 60_000;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;

// Used to keep login timing similar whether or not the email exists.
let dummyHash: Promise<string> | null = null;

export function cookieName(c: Context<AppEnv>): string {
  return c.env.APP_ENV === "development" ? "hj_admin_session" : "__Host-hj_admin_session";
}

export function adminToDTO(u: typeof adminUsers.$inferSelect): AdminUserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export async function login(c: Context<AppEnv>, db: Database, email: string, password: string) {
  const user = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).get();
  const invalid = new HttpError(401, "Incorrect email or password");

  if (!user) {
    dummyHash ??= hashPassword("timing-equaliser-password");
    await verifyPassword(password, await dummyHash);
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > nowIso()) {
    throw new HttpError(423, "This account is temporarily locked after repeated failed sign-ins. Try again in 15 minutes.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    if (!ok) {
      const failures = user.failedLoginCount + 1;
      await db
        .update(adminUsers)
        .set({
          failedLoginCount: failures >= MAX_FAILED_LOGINS ? 0 : failures,
          lockedUntil: failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : user.lockedUntil,
        })
        .where(eq(adminUsers.id, user.id));
    }
    throw invalid;
  }

  const token = randomToken(32);
  const now = Date.now();
  await db.batch([
    db.insert(adminSessions).values({
      adminId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(now + SESSION_ABSOLUTE_MS).toISOString(),
      ipAddress: clientIp(c),
      userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
    }),
    db
      .update(adminUsers)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(now).toISOString() })
      .where(eq(adminUsers.id, user.id)),
  ]);

  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: c.env.APP_ENV !== "development",
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_ABSOLUTE_MS / 1000,
  });
  return user;
}

export async function logout(c: Context<AppEnv>, db: Database): Promise<void> {
  const token = getCookie(c, cookieName(c));
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, await sha256Hex(token)));
  deleteCookie(c, cookieName(c), { path: "/", secure: c.env.APP_ENV !== "development" });
}

/** Resolve the signed-in admin from the session cookie, or null. */
export async function resolveSession(c: Context<AppEnv>, db: Database) {
  const token = getCookie(c, cookieName(c));
  if (!token || token.length > 100) return null;
  const now = new Date();
  const row = await db
    .select({ session: adminSessions, user: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminId, adminUsers.id))
    .where(and(eq(adminSessions.tokenHash, await sha256Hex(token)), gt(adminSessions.expiresAt, now.toISOString())))
    .get();
  if (!row || !row.user.isActive) return null;

  const lastSeen = new Date(row.session.lastSeenAt).getTime();
  if (now.getTime() - lastSeen > SESSION_IDLE_MS) {
    await db.delete(adminSessions).where(eq(adminSessions.id, row.session.id));
    return null;
  }
  if (now.getTime() - lastSeen > TOUCH_INTERVAL_MS) {
    c.executionCtx.waitUntil(
      db.update(adminSessions).set({ lastSeenAt: now.toISOString() }).where(eq(adminSessions.id, row.session.id)).then(() => undefined),
    );
  }
  return row;
}

export async function revokeUserSessions(db: Database, adminId: number, exceptSessionId?: number) {
  await db
    .delete(adminSessions)
    .where(
      exceptSessionId
        ? and(eq(adminSessions.adminId, adminId), ne(adminSessions.id, exceptSessionId))
        : eq(adminSessions.adminId, adminId),
    );
}

export async function pruneSessions(db: Database): Promise<void> {
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, nowIso()));
}
