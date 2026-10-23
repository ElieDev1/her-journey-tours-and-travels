import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { HttpError } from "../lib/http";

// Keep in sync with public/_headers, which covers statically served pages.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.google.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated routes: state-changing requests must
 * come from our own origin and carry a custom header, which cross-site forms
 * cannot send without a CORS preflight we never grant.
 */
export const sameOriginOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header("origin");
    const host = new URL(c.req.url).host;
    if (origin && new URL(origin).host !== host) throw new HttpError(403, "Cross-site request blocked");
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new HttpError(403, "Cross-site request blocked");
    if (c.req.header("x-requested-with") !== "fetch") throw new HttpError(403, "Missing request header");
  }
  await next();
};

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  // Responses passed through from the assets binding have immutable headers.
  c.res = new Response(c.res.body, c.res);
  const h = c.res.headers;
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("x-frame-options", "DENY");
  h.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (c.env.APP_ENV !== "development") {
    h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  if (h.get("content-type")?.startsWith("text/html") && c.env.APP_ENV !== "development") {
    h.set("content-security-policy", CONTENT_SECURITY_POLICY);
  }
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    h.set("cache-control", h.get("cache-control") ?? "no-store");
  }
};
