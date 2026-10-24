import { Hono } from "hono";
import type { AppEnv } from "./env";
import { createDb } from "./db/client";
import { HttpError } from "./lib/http";
import { securityHeaders } from "./middleware/security";
import { publicRoutes } from "./routes/public";
import { adminRoutes } from "./routes/admin";
import { accountRoutes } from "./routes/account";
import { seoRoutes } from "./routes/seo";
import { serveMedia } from "./services/media";
import { expireStaleBookings } from "./services/bookings";
import { pruneRateLimits } from "./services/rateLimit";
import { pruneSessions } from "./services/auth";
import { pruneCustomerSessions } from "./services/customerAuth";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});
app.use("*", securityHeaders);

app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true });
});
app.route("/api/public", publicRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/account", accountRoutes);
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.get("/media/*", (c) => serveMedia(c.env.MEDIA, c.req.path.slice("/media/".length), c.req.raw));

app.route("/", seoRoutes);

// Anything else the Worker sees is part of the single-page app.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) }, err.status);
  }
  console.error("unhandled_error", { path: c.req.path, method: c.req.method, error: err.stack ?? String(err) });
  return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    const db = createDb(env.DB);
    ctx.waitUntil(
      (async () => {
        const expired = await expireStaleBookings(db, env.DB, 500);
        await Promise.all([pruneRateLimits(db), pruneSessions(db), pruneCustomerSessions(db)]);
        console.log("scheduled_maintenance", { expired });
      })(),
    );
  },
} satisfies ExportedHandler<AppEnv["Bindings"]>;
