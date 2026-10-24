import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import type { Database } from "../db/client";
import { adminUsers, customers } from "../db/schema";
import { clientIp, isUniqueViolation } from "../lib/http";
import type { AuthConfigDTO } from "../../shared/types";
import { nowIso } from "../../shared/time";
import { audit } from "../services/audit";
import { createAdminSession } from "../services/auth";
import { endAllCustomerSessions, startCustomerSession, type CustomerRow } from "../services/customerAuth";
import { emailConfigured } from "../services/email";
import { enforceRateLimit } from "../services/rateLimit";
import type { GoogleIdentity } from "../services/googleIdToken";
import {
  OAuthFlowError,
  completeGoogleFlow,
  consumeFlow,
  googleEnabled,
  safeReturnTo,
  startGoogleFlow,
  type OAuthIntent,
} from "../services/googleOAuth";

/** Sign-in features shared by travellers and staff: feature flags and Sign in with Google. */
export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/config", (c) => {
  const body: AuthConfigDTO = { google: googleEnabled(c.env), passwordReset: emailConfigured(c.env) };
  c.header("cache-control", "public, max-age=60");
  return c.json(body);
});

type FailureCode = "google_cancelled" | "google_expired" | "google_failed" | "google_conflict" | "account_disabled" | "admin_not_found" | "google_unavailable";

function failure(c: Context<AppEnv>, intent: OAuthIntent, code: FailureCode) {
  return c.redirect(`${intent === "admin" ? "/admin/login" : "/login"}?error=${code}`, 302);
}

authRoutes.get("/google/start", async (c) => {
  const intent: OAuthIntent = c.req.query("intent") === "admin" ? "admin" : "customer";
  if (!googleEnabled(c.env)) return failure(c, intent, "google_unavailable");
  await enforceRateLimit(c.get("db"), `google-start:${clientIp(c)}`, 30, 900);
  const url = await startGoogleFlow(c, intent, safeReturnTo(c.req.query("returnTo"), intent));
  return c.redirect(url, 302);
});

class SignInRefused extends Error {
  constructor(public readonly code: FailureCode) {
    super(code);
  }
}

/**
 * Sign a traveller in with a verified Google identity: an existing linked
 * account, an existing account with the same email (linked now), or a new one.
 */
async function customerFromGoogle(db: Database, id: GoogleIdentity, ip: string): Promise<CustomerRow> {
  const now = nowIso();
  const bySub = await db.select().from(customers).where(eq(customers.googleSub, id.sub)).get();
  if (bySub) {
    if (bySub.disabledAt) throw new SignInRefused("account_disabled");
    await db.update(customers).set({ lastLoginAt: now, emailVerifiedAt: bySub.emailVerifiedAt ?? now }).where(eq(customers.id, bySub.id));
    return bySub;
  }

  const byEmail = await db.select().from(customers).where(eq(customers.email, id.email)).get();
  if (byEmail) {
    if (byEmail.disabledAt) throw new SignInRefused("account_disabled");
    if (byEmail.googleSub) throw new SignInRefused("google_conflict");
    // The email was never proven for this password account, so whoever set that
    // password may not own the inbox. Google has now proven ownership: drop the
    // unverified password and its sessions (the owner can set a new one later).
    const unverified = byEmail.emailVerifiedAt === null && byEmail.passwordHash !== "";
    await db
      .update(customers)
      .set({ googleSub: id.sub, emailVerifiedAt: now, lastLoginAt: now, ...(unverified ? { passwordHash: "" } : {}) })
      .where(eq(customers.id, byEmail.id));
    if (unverified) await endAllCustomerSessions(db, byEmail.id);
    await audit(db, { adminId: null, action: "customer.google_linked", entityType: "customer", entityId: byEmail.id, details: { passwordCleared: unverified }, ip });
    return byEmail;
  }

  try {
    const created = await db
      .insert(customers)
      .values({
        email: id.email,
        fullName: id.name ?? id.email.split("@")[0]!,
        passwordHash: "",
        googleSub: id.sub,
        emailVerifiedAt: now,
        lastLoginAt: now,
      })
      .returning()
      .get();
    await audit(db, { adminId: null, action: "customer.signup_google", entityType: "customer", entityId: created.id, ip });
    return created;
  } catch (err) {
    // A concurrent callback created the same account first.
    if (isUniqueViolation(err)) throw new SignInRefused("google_failed");
    throw err;
  }
}

authRoutes.get("/google/callback", async (c) => {
  const db = c.get("db");
  let intent: OAuthIntent = "customer";
  try {
    await enforceRateLimit(db, `google-callback:${clientIp(c)}`, 30, 900);
    const flow = consumeFlow(c);
    intent = flow.intent;
    if (!googleEnabled(c.env)) return failure(c, intent, "google_unavailable");
    const identity = await completeGoogleFlow(c, flow);

    if (intent === "admin") {
      // Google only signs in existing, active admins whose admin email matches; it never creates one.
      const admin = await db.select().from(adminUsers).where(eq(adminUsers.email, identity.email)).get();
      if (!admin || !admin.isActive) return failure(c, intent, "admin_not_found");
      await createAdminSession(c, db, admin);
      await audit(db, { adminId: admin.id, action: "auth.login_google", entityType: "admin_user", entityId: admin.id, ip: clientIp(c) });
      return c.redirect(flow.returnTo, 302);
    }

    const customer = await customerFromGoogle(db, identity, clientIp(c));
    await startCustomerSession(c, db, customer.id);
    return c.redirect(flow.returnTo, 302);
  } catch (err) {
    if (err instanceof OAuthFlowError) return failure(c, err.intent, err.code);
    if (err instanceof SignInRefused) return failure(c, intent, err.code);
    console.error("google_callback_error", { error: String(err) });
    return failure(c, intent, "google_failed");
  }
});
