import { and, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { customers, passwordResetTokens } from "../db/schema";
import type { AppEnv } from "../env";
import { hashPassword, randomToken, sha256Hex } from "../lib/crypto";
import { HttpError } from "../lib/http";
import { nowIso } from "../../shared/time";
import { endAllCustomerSessions } from "./customerAuth";
import { sendEmail } from "./email";

const RESET_TTL_MS = 30 * 60_000;

/**
 * Email a single-use reset link if an active account exists. Callers must
 * respond identically either way so the response never reveals whether an
 * email is registered.
 */
export async function requestPasswordReset(
  env: AppEnv["Bindings"],
  db: Database,
  email: string,
  origin: string,
  ip: string,
): Promise<void> {
  const customer = await db.select().from(customers).where(eq(customers.email, email)).get();
  if (!customer || customer.disabledAt) return;

  const token = randomToken(32);
  // Only the newest link works: drop any earlier unused ones.
  await db.batch([
    db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.customerId, customer.id), isNull(passwordResetTokens.usedAt))),
    db.insert(passwordResetTokens).values({
      customerId: customer.id,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
      requestIp: ip,
    }),
  ]);

  const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  const intro = customer.passwordHash
    ? "We received a request to reset the password for your Her Journey Tours and Travels account."
    : "We received a request to set a password for your Her Journey Tours and Travels account (you currently sign in with Google).";
  await sendEmail(env, {
    to: customer.email,
    subject: "Reset your Her Journey password",
    text: [
      `Hello ${customer.fullName},`,
      "",
      intro,
      "",
      "Choose a new password here (the link works once and expires in 30 minutes):",
      link,
      "",
      "If you didn't ask for this, you can ignore this email. Your password won't change.",
      "",
      "Her Journey Tours and Travels",
    ].join("\n"),
    html: `<p>Hello ${escapeHtml(customer.fullName)},</p><p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d5233;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p style="color:#5b6a61;font-size:14px">The link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password won't change.</p>
<p style="color:#5b6a61;font-size:14px">Her Journey Tours and Travels</p>`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Consume a reset token and set the new password. Ends all of the user's sessions. */
export async function resetPassword(db: Database, token: string, newPassword: string): Promise<void> {
  const invalid = new HttpError(400, "This reset link is invalid or has expired. Please request a new one.");
  const now = nowIso();
  // Atomically claim the token so it can only be used once.
  const claimed = await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, await sha256Hex(token)),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .returning({ customerId: passwordResetTokens.customerId, expiresAt: passwordResetTokens.expiresAt })
    .get();
  if (!claimed || claimed.expiresAt <= now) throw invalid;

  const customer = await db.select().from(customers).where(eq(customers.id, claimed.customerId)).get();
  if (!customer || customer.disabledAt) throw invalid;

  await db
    .update(customers)
    .set({
      passwordHash: await hashPassword(newPassword),
      // Following the emailed link proves the person controls this inbox.
      emailVerifiedAt: customer.emailVerifiedAt ?? now,
      failedLoginCount: 0,
      lockedUntil: null,
    })
    .where(eq(customers.id, customer.id));
  await db
    .delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.customerId, customer.id), ne(passwordResetTokens.tokenHash, await sha256Hex(token))));
  await endAllCustomerSessions(db, customer.id);
}
