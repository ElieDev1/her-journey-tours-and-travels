import type { AppEnv } from "../env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type Bindings = AppEnv["Bindings"];

/** True when at least one delivery method is configured. */
export function emailConfigured(env: Bindings): boolean {
  return Boolean((env.EMAIL && env.EMAIL_FROM) || env.RESEND_API_KEY);
}

async function sendWithCloudflare(env: Bindings, message: OutgoingEmail): Promise<void> {
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });
}

async function sendWithResend(env: Bindings, message: OutgoingEmail): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

/**
 * Send a transactional email. Uses Cloudflare Email Sending (the EMAIL
 * binding) and falls back to Resend when RESEND_API_KEY is set. Never throws:
 * callers treat email as best effort, and failures are logged.
 */
export async function sendEmail(env: Bindings, message: OutgoingEmail): Promise<boolean> {
  if (env.EMAIL && env.EMAIL_FROM) {
    try {
      await sendWithCloudflare(env, message);
      return true;
    } catch (err) {
      // Typically: the domain is not onboarded to Email Sending yet, or the
      // account is not on Workers Paid.
      console.error("email_send_failed", { provider: "cloudflare", subject: message.subject, error: String(err) });
    }
  }
  if (env.RESEND_API_KEY) {
    try {
      await sendWithResend(env, message);
      return true;
    } catch (err) {
      console.error("email_send_failed", { provider: "resend", subject: message.subject, error: String(err) });
    }
  }
  if (!emailConfigured(env)) console.warn("email_not_configured", { subject: message.subject });
  return false;
}
