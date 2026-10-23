import type { AppEnv } from "../env";

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends transactional email through Resend when RESEND_API_KEY and
 * EMAIL_FROM are configured. Without them, email is skipped and the
 * booking flow continues (customers always see their status on the site).
 */
export async function sendEmail(env: AppEnv["Bindings"], message: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) console.error("email_send_failed", { status: res.status, subject: message.subject });
  } catch (err) {
    console.error("email_send_error", { error: String(err), subject: message.subject });
  }
}
