import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { AppEnv } from "../../env";
import { tourReviews, tours } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { clientIp, notFound, parseId, parseJson } from "../../lib/http";
import { reviewAdminSchema, reviewFlagsSchema, siteSettingsSchema } from "../../../shared/schemas";
import type { AdminSettingsDTO } from "../../../shared/types";
import { audit } from "../../services/audit";
import { reviewToDTO } from "../../services/tours";
import { getSetting, loadSettings, saveSettings } from "../../services/settings";
import { deleteObjects, mediaUrl, storeImage } from "../../services/media";

export const adminContentRoutes = new Hono<AppEnv>();
const canContent = requirePermission("content:write");
const canSettings = requirePermission("settings:write");

// ---------- reviews & testimonials ----------

adminContentRoutes.get("/reviews", async (c) => {
  const rows = await c
    .get("db")
    .select({ review: tourReviews, tourTitle: tours.title })
    .from(tourReviews)
    .leftJoin(tours, eq(tourReviews.tourId, tours.id))
    .orderBy(desc(tourReviews.createdAt))
    .limit(500);
  return c.json({ items: rows.map((r) => reviewToDTO(r.review, r.tourTitle)) });
});

adminContentRoutes.post("/reviews", canContent, async (c) => {
  const db = c.get("db");
  const input = await parseJson(c, reviewAdminSchema);
  const row = await db.insert(tourReviews).values(input).returning().get();
  await audit(db, { adminId: c.get("admin").id, action: "review.create", entityType: "review", entityId: row.id, ip: clientIp(c) });
  return c.json(reviewToDTO(row), 201);
});

adminContentRoutes.patch("/reviews/:id", canContent, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Review");
  const input = await parseJson(c, reviewFlagsSchema);
  const row = await db.update(tourReviews).set(input).where(eq(tourReviews.id, id)).returning().get();
  if (!row) throw notFound("Review");
  await audit(db, { adminId: c.get("admin").id, action: "review.update", entityType: "review", entityId: id, details: input, ip: clientIp(c) });
  return c.json(reviewToDTO(row));
});

adminContentRoutes.delete("/reviews/:id", canContent, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Review");
  const row = await db.delete(tourReviews).where(eq(tourReviews.id, id)).returning().get();
  if (!row) throw notFound("Review");
  await audit(db, { adminId: c.get("admin").id, action: "review.delete", entityType: "review", entityId: id, ip: clientIp(c) });
  return c.json({ ok: true });
});

// ---------- site settings ----------

async function settingsBody(c: { get: (k: "db") => AppEnv["Variables"]["db"] }): Promise<AdminSettingsDTO> {
  const values = await loadSettings(c.get("db"));
  const heroKey = typeof values.hero_image_key === "string" ? values.hero_image_key : null;
  return { values, heroImageUrl: heroKey ? mediaUrl(heroKey) : null };
}

adminContentRoutes.get("/settings", async (c) => c.json(await settingsBody(c)));

adminContentRoutes.put("/settings", canSettings, async (c) => {
  const db = c.get("db");
  const input = await parseJson(c, siteSettingsSchema);
  await saveSettings(db, input, c.get("admin").id);
  await audit(db, { adminId: c.get("admin").id, action: "settings.update", entityType: "settings", details: input, ip: clientIp(c) });
  return c.json(await settingsBody(c));
});

adminContentRoutes.post("/settings/hero-image", canSettings, async (c) => {
  const db = c.get("db");
  const form = await c.req.formData();
  const stored = await storeImage(c.env.MEDIA, form.get("file"), "site");
  const previous = await getSetting(db, "hero_image_key");
  await saveSettings(db, { hero_image_key: stored.key }, c.get("admin").id);
  if (typeof previous === "string") await deleteObjects(c.env.MEDIA, [previous]);
  await audit(db, { adminId: c.get("admin").id, action: "settings.hero_image", entityType: "settings", ip: clientIp(c) });
  return c.json(await settingsBody(c));
});

adminContentRoutes.delete("/settings/hero-image", canSettings, async (c) => {
  const db = c.get("db");
  const previous = await getSetting(db, "hero_image_key");
  await saveSettings(db, { hero_image_key: null }, c.get("admin").id);
  if (typeof previous === "string") await deleteObjects(c.env.MEDIA, [previous]);
  await audit(db, { adminId: c.get("admin").id, action: "settings.hero_image_remove", entityType: "settings", ip: clientIp(c) });
  return c.json(await settingsBody(c));
});
