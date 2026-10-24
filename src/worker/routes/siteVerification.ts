import type { Hono } from "hono";
import type { AppEnv } from "../env";

/**
 * Google Search Console ownership proof for herjourney.rw. DO NOT REMOVE:
 * deleting it un-verifies the property. Served by the Worker (not as a static
 * asset, which would be redirected to the extension-less path) on every host,
 * including www, ahead of the www redirect.
 */
const VERIFICATION_FILES: Record<string, string> = {
  "/googleb9325a9dbac8e007.html": "google-site-verification: googleb9325a9dbac8e007.html",
};

export function registerSiteVerification(app: Hono<AppEnv>): void {
  for (const [path, body] of Object.entries(VERIFICATION_FILES)) {
    app.get(path, () => new Response(body, { status: 200, headers: { "content-type": "text/html", "cache-control": "public, max-age=300" } }));
  }
}

export const verificationPaths = new Set(Object.keys(VERIFICATION_FILES));
