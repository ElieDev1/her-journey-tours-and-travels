import { Hono } from "hono";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AppEnv } from "../../env";
import type { Database } from "../../db/client";
import { bookings, tourCategories, tourDepartures, tourImages, tourListItems, tours } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { HttpError, clientIp, notFound, parseId, parseJson, parseWith } from "../../lib/http";
import {
  categoryUpsertSchema,
  departureUpsertSchema,
  imageUpdateSchema,
  tourFlagsSchema,
  tourUpsertSchema,
  type TourUpsert,
} from "../../../shared/schemas";
import { IMAGE_KINDS, TOUR_LIST_KINDS, TOUR_STATUSES, type ImageKind } from "../../../shared/constants";
import { businessLocalToIso, businessToday, nowIso } from "../../../shared/time";
import type { AdminTourDTO, AdminTourRowDTO, CategoryDTO } from "../../../shared/types";
import { audit, auditInsert } from "../../services/audit";
import { deleteObjects, mediaUrl, storeImage } from "../../services/media";
import { departureToDTO, imageToDTO, loadTourDetail } from "../../services/tours";
import { z } from "zod";

export const adminTourRoutes = new Hono<AppEnv>();
const canWrite = requirePermission("tours:write");

// ---------- tours ----------

adminTourRoutes.get("/tours", async (c) => {
  const db = c.get("db");
  const q = c.req.query("q")?.trim();
  const status = c.req.query("status");
  const conds: SQL[] = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(sql`(${tours.title} LIKE ${like} OR ${tours.destination} LIKE ${like})`);
  }
  if (status && (TOUR_STATUSES as readonly string[]).includes(status)) {
    conds.push(eq(tours.status, status as (typeof TOUR_STATUSES)[number]));
  }
  const today = businessToday();
  const rows = await db
    .select({
      tour: tours,
      categoryName: tourCategories.name,
      coverKey: sql<string | null>`(SELECT COALESCE(i.r2_key_small, i.r2_key) FROM tour_images i WHERE i.tour_id = ${tours.id} AND i.r2_key IS NOT NULL ORDER BY i.kind, i.sort_order LIMIT 1)`,
      coverExternal: sql<string | null>`(SELECT i.external_url FROM tour_images i WHERE i.tour_id = ${tours.id} AND i.kind IN ('cover','gallery') ORDER BY i.kind, i.sort_order LIMIT 1)`,
      nextDepartureDate: sql<string | null>`(SELECT MIN(d.start_date) FROM tour_departures d WHERE d.tour_id = ${tours.id} AND d.status = 'scheduled' AND d.start_date >= ${today})`,
      departureCount: sql<number>`(SELECT count(*) FROM tour_departures d WHERE d.tour_id = ${tours.id})`,
      bookingCount: sql<number>`(SELECT count(*) FROM bookings b WHERE b.tour_id = ${tours.id})`,
    })
    .from(tours)
    .leftJoin(tourCategories, eq(tours.categoryId, tourCategories.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(tours.updatedAt))
    .limit(500);

  const items: AdminTourRowDTO[] = rows.map((r) => ({
    id: r.tour.id,
    slug: r.tour.slug,
    title: r.tour.title,
    destination: r.tour.destination,
    status: r.tour.status,
    isFeatured: r.tour.isFeatured,
    isPopular: r.tour.isPopular,
    currency: r.tour.currency,
    adultPrice: r.tour.adultPrice,
    categoryName: r.categoryName,
    coverUrl: r.coverKey ? mediaUrl(r.coverKey) : r.coverExternal,
    nextDepartureDate: r.nextDepartureDate,
    departureCount: r.departureCount,
    bookingCount: r.bookingCount,
    updatedAt: r.tour.updatedAt,
  }));
  return c.json({ items });
});

async function loadAdminTour(db: Database, id: number): Promise<AdminTourDTO> {
  const tour = await db.select().from(tours).where(eq(tours.id, id)).get();
  if (!tour) throw notFound("Tour");
  const [detail, count] = await Promise.all([
    loadTourDetail(db, tour, false),
    db.select({ n: sql<number>`count(*)` }).from(bookings).where(eq(bookings.tourId, id)).get(),
  ]);
  return {
    ...detail,
    status: tour.status,
    categoryId: tour.categoryId,
    publishedAt: tour.publishedAt,
    createdAt: tour.createdAt,
    updatedAt: tour.updatedAt,
    bookingCount: count?.n ?? 0,
  };
}

adminTourRoutes.get("/tours/:id", async (c) => c.json(await loadAdminTour(c.get("db"), parseId(c.req.param("id"), "Tour"))));

function tourColumns(input: TourUpsert) {
  const { lists: _lists, ...columns } = input;
  return columns;
}

function listInserts(db: Database, tourId: number, lists: TourUpsert["lists"]) {
  return TOUR_LIST_KINDS.flatMap((kind) =>
    lists[kind].map((text, i) => db.insert(tourListItems).values({ tourId, kind, text, sortOrder: i })),
  );
}

async function assertSlugFree(db: Database, slug: string, exceptId?: number) {
  const existing = await db.select({ id: tours.id }).from(tours).where(eq(tours.slug, slug)).get();
  if (existing && existing.id !== exceptId) {
    throw new HttpError(409, "Another tour already uses this URL slug", { slug: "Already in use" });
  }
}

adminTourRoutes.post("/tours", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const input = await parseJson(c, tourUpsertSchema);
  await assertSlugFree(db, input.slug);

  const created = await db
    .insert(tours)
    .values({
      ...tourColumns(input),
      publishedAt: input.status === "published" ? nowIso() : null,
      createdBy: admin.id,
      updatedBy: admin.id,
    })
    .returning({ id: tours.id })
    .get();
  const inserts = listInserts(db, created.id, input.lists);
  await db.batch([
    auditInsert(db, { adminId: admin.id, action: "tour.create", entityType: "tour", entityId: created.id, details: { title: input.title }, ip: clientIp(c) }),
    ...inserts,
  ]);
  return c.json(await loadAdminTour(db, created.id), 201);
});

adminTourRoutes.put("/tours/:id", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Tour");
  const existing = await db.select().from(tours).where(eq(tours.id, id)).get();
  if (!existing) throw notFound("Tour");
  const input = await parseJson(c, tourUpsertSchema);
  await assertSlugFree(db, input.slug, id);

  await db.batch([
    db
      .update(tours)
      .set({
        ...tourColumns(input),
        publishedAt: input.status === "published" ? (existing.publishedAt ?? nowIso()) : existing.publishedAt,
        updatedBy: admin.id,
      })
      .where(eq(tours.id, id)),
    db.delete(tourListItems).where(eq(tourListItems.tourId, id)),
    ...listInserts(db, id, input.lists),
    auditInsert(db, { adminId: admin.id, action: "tour.update", entityType: "tour", entityId: id, details: { title: input.title, status: input.status }, ip: clientIp(c) }),
  ]);
  return c.json(await loadAdminTour(db, id));
});

adminTourRoutes.patch("/tours/:id", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Tour");
  const input = await parseJson(c, tourFlagsSchema);
  const existing = await db.select().from(tours).where(eq(tours.id, id)).get();
  if (!existing) throw notFound("Tour");
  await db.batch([
    db
      .update(tours)
      .set({
        ...input,
        publishedAt: input.status === "published" && !existing.publishedAt ? nowIso() : existing.publishedAt,
        updatedBy: admin.id,
      })
      .where(eq(tours.id, id)),
    auditInsert(db, { adminId: admin.id, action: "tour.flags", entityType: "tour", entityId: id, details: input, ip: clientIp(c) }),
  ]);
  return c.json(await loadAdminTour(db, id));
});

adminTourRoutes.delete("/tours/:id", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Tour");
  const tour = await db.select().from(tours).where(eq(tours.id, id)).get();
  if (!tour) throw notFound("Tour");
  const hasBookings = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.tourId, id)).get();
  if (hasBookings) {
    throw new HttpError(409, "This tour has bookings, so it cannot be deleted. Archive it instead to hide it from the website.");
  }
  const images = await db.select().from(tourImages).where(eq(tourImages.tourId, id));
  await db.batch([
    db.delete(tours).where(eq(tours.id, id)),
    auditInsert(db, { adminId: admin.id, action: "tour.delete", entityType: "tour", entityId: id, details: { title: tour.title }, ip: clientIp(c) }),
  ]);
  await deleteObjects(c.env.MEDIA, images.flatMap((i) => [i.r2Key, i.r2KeySmall]));
  return c.json({ ok: true });
});

// ---------- departures ----------

function departureValues(input: z.output<typeof departureUpsertSchema>) {
  return { ...input, bookingDeadline: input.bookingDeadline ? businessLocalToIso(input.bookingDeadline) : null };
}

adminTourRoutes.post("/tours/:id/departures", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const tourId = parseId(c.req.param("id"), "Tour");
  const tour = await db.select().from(tours).where(eq(tours.id, tourId)).get();
  if (!tour) throw notFound("Tour");
  const input = await parseJson(c, departureUpsertSchema);
  const clash = await db
    .select({ id: tourDepartures.id })
    .from(tourDepartures)
    .where(and(eq(tourDepartures.tourId, tourId), eq(tourDepartures.startDate, input.startDate)))
    .get();
  if (clash) throw new HttpError(409, "This tour already has a departure on that date", { startDate: "Already scheduled" });
  const row = await db.insert(tourDepartures).values({ ...departureValues(input), tourId }).returning().get();
  await audit(db, { adminId: admin.id, action: "departure.create", entityType: "departure", entityId: row.id, details: { tourId, startDate: row.startDate }, ip: clientIp(c) });
  return c.json(departureToDTO(row, tour), 201);
});

adminTourRoutes.put("/departures/:id", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Departure");
  const input = await parseJson(c, departureUpsertSchema);
  const row = await db
    .select({ departure: tourDepartures, tour: tours })
    .from(tourDepartures)
    .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
    .where(eq(tourDepartures.id, id))
    .get();
  if (!row) throw notFound("Departure");
  const clash = await db
    .select({ id: tourDepartures.id })
    .from(tourDepartures)
    .where(and(eq(tourDepartures.tourId, row.tour.id), eq(tourDepartures.startDate, input.startDate)))
    .get();
  if (clash && clash.id !== id) throw new HttpError(409, "This tour already has a departure on that date", { startDate: "Already scheduled" });

  // The capacity guard lives in SQL so it holds even if a booking lands concurrently.
  const updated = await db
    .update(tourDepartures)
    .set(departureValues(input))
    .where(
      and(
        eq(tourDepartures.id, id),
        input.seatCapacity === null ? undefined : sql`${tourDepartures.seatsReserved} <= ${input.seatCapacity}`,
      ),
    )
    .returning()
    .get();
  if (!updated) {
    throw new HttpError(409, `Capacity cannot be lower than the ${row.departure.seatsReserved} seats already reserved.`, {
      seatCapacity: `At least ${row.departure.seatsReserved}`,
    });
  }
  await audit(db, { adminId: admin.id, action: "departure.update", entityType: "departure", entityId: id, details: input, ip: clientIp(c) });
  return c.json(departureToDTO(updated, row.tour));
});

adminTourRoutes.delete("/departures/:id", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Departure");
  const hasBookings = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.departureId, id)).get();
  if (hasBookings) {
    throw new HttpError(409, "This departure has bookings. Set its status to Cancelled or Closed instead of deleting it.");
  }
  const deleted = await db.delete(tourDepartures).where(eq(tourDepartures.id, id)).returning().get();
  if (!deleted) throw notFound("Departure");
  await audit(db, { adminId: admin.id, action: "departure.delete", entityType: "departure", entityId: id, details: { startDate: deleted.startDate }, ip: clientIp(c) });
  return c.json({ ok: true });
});

// ---------- images ----------

const imageMetaSchema = z.object({
  kind: z.enum(IMAGE_KINDS),
  altText: z.string().trim().max(250).default(""),
  width: z.coerce.number().int().min(1).max(20000).optional(),
  height: z.coerce.number().int().min(1).max(20000).optional(),
});

/** Cover and poster are single images: uploading a new one replaces the old. */
const SINGLE_KINDS: ImageKind[] = ["cover", "poster"];

adminTourRoutes.post("/tours/:id/images", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const tourId = parseId(c.req.param("id"), "Tour");
  const tour = await db.select({ id: tours.id }).from(tours).where(eq(tours.id, tourId)).get();
  if (!tour) throw notFound("Tour");

  const form = await c.req.formData();
  const meta = parseWith(imageMetaSchema, {
    kind: form.get("kind"),
    altText: form.get("altText") ?? "",
    width: form.get("width") || undefined,
    height: form.get("height") || undefined,
  });
  const large = await storeImage(c.env.MEDIA, form.get("file"), `tours/${tourId}`);
  const smallFile = form.get("fileSmall");
  const small = smallFile instanceof File && smallFile.size > 0 ? await storeImage(c.env.MEDIA, smallFile, `tours/${tourId}`) : null;

  const replaced = SINGLE_KINDS.includes(meta.kind)
    ? await db.select().from(tourImages).where(and(eq(tourImages.tourId, tourId), eq(tourImages.kind, meta.kind)))
    : [];
  const maxSort = await db
    .select({ n: sql<number>`COALESCE(MAX(${tourImages.sortOrder}), -1)` })
    .from(tourImages)
    .where(eq(tourImages.tourId, tourId))
    .get();

  const row = await db
    .insert(tourImages)
    .values({
      tourId,
      kind: meta.kind,
      r2Key: large.key,
      r2KeySmall: small?.key ?? null,
      altText: meta.altText,
      width: meta.width ?? null,
      height: meta.height ?? null,
      contentType: large.contentType,
      sizeBytes: large.size,
      sortOrder: (maxSort?.n ?? -1) + 1,
    })
    .returning()
    .get();

  if (replaced.length) {
    for (const old of replaced) await db.delete(tourImages).where(eq(tourImages.id, old.id));
    await deleteObjects(c.env.MEDIA, replaced.flatMap((i) => [i.r2Key, i.r2KeySmall]));
  }
  // A real upload retires the bundled placeholder art of the same kind.
  if (meta.kind !== "poster") {
    await db.delete(tourImages).where(and(eq(tourImages.tourId, tourId), eq(tourImages.isPlaceholder, true), eq(tourImages.kind, meta.kind)));
  }
  await audit(db, { adminId: admin.id, action: "image.upload", entityType: "tour", entityId: tourId, details: { kind: meta.kind, imageId: row.id }, ip: clientIp(c) });
  return c.json(imageToDTO(row), 201);
});

adminTourRoutes.put("/images/:id/file", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Image");
  const image = await db.select().from(tourImages).where(eq(tourImages.id, id)).get();
  if (!image) throw notFound("Image");
  const form = await c.req.formData();
  const large = await storeImage(c.env.MEDIA, form.get("file"), `tours/${image.tourId}`);
  const smallFile = form.get("fileSmall");
  const small = smallFile instanceof File && smallFile.size > 0 ? await storeImage(c.env.MEDIA, smallFile, `tours/${image.tourId}`) : null;
  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;

  const row = await db
    .update(tourImages)
    .set({
      r2Key: large.key,
      r2KeySmall: small?.key ?? null,
      externalUrl: null,
      isPlaceholder: false,
      contentType: large.contentType,
      sizeBytes: large.size,
      width,
      height,
    })
    .where(eq(tourImages.id, id))
    .returning()
    .get();
  await deleteObjects(c.env.MEDIA, [image.r2Key, image.r2KeySmall]);
  await audit(db, { adminId: admin.id, action: "image.replace", entityType: "tour", entityId: image.tourId, details: { imageId: id }, ip: clientIp(c) });
  return c.json(imageToDTO(row!));
});

adminTourRoutes.patch("/images/:id", canWrite, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Image");
  const input = await parseJson(c, imageUpdateSchema);
  const row = await db.update(tourImages).set(input).where(eq(tourImages.id, id)).returning().get();
  if (!row) throw notFound("Image");
  return c.json(imageToDTO(row));
});

adminTourRoutes.delete("/images/:id", canWrite, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  const id = parseId(c.req.param("id"), "Image");
  const row = await db.delete(tourImages).where(eq(tourImages.id, id)).returning().get();
  if (!row) throw notFound("Image");
  await deleteObjects(c.env.MEDIA, [row.r2Key, row.r2KeySmall]);
  await audit(db, { adminId: admin.id, action: "image.delete", entityType: "tour", entityId: row.tourId, details: { imageId: id, kind: row.kind }, ip: clientIp(c) });
  return c.json({ ok: true });
});

// ---------- categories ----------

adminTourRoutes.get("/categories", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select({
      id: tourCategories.id,
      name: tourCategories.name,
      slug: tourCategories.slug,
      description: tourCategories.description,
      sortOrder: tourCategories.sortOrder,
      tourCount: sql<number>`(SELECT count(*) FROM tours t WHERE t.category_id = ${tourCategories.id})`,
    })
    .from(tourCategories)
    .orderBy(asc(tourCategories.sortOrder), asc(tourCategories.name));
  return c.json({ items: rows satisfies CategoryDTO[] });
});

async function assertCategorySlugFree(db: Database, slug: string, exceptId?: number) {
  const row = await db.select({ id: tourCategories.id }).from(tourCategories).where(eq(tourCategories.slug, slug)).get();
  if (row && row.id !== exceptId) throw new HttpError(409, "Another category uses this slug", { slug: "Already in use" });
}

adminTourRoutes.post("/categories", canWrite, async (c) => {
  const db = c.get("db");
  const input = await parseJson(c, categoryUpsertSchema);
  await assertCategorySlugFree(db, input.slug);
  const row = await db.insert(tourCategories).values(input).returning().get();
  await audit(db, { adminId: c.get("admin").id, action: "category.create", entityType: "category", entityId: row.id, details: { name: row.name }, ip: clientIp(c) });
  return c.json(row, 201);
});

adminTourRoutes.put("/categories/:id", canWrite, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Category");
  const input = await parseJson(c, categoryUpsertSchema);
  await assertCategorySlugFree(db, input.slug, id);
  const row = await db.update(tourCategories).set(input).where(eq(tourCategories.id, id)).returning().get();
  if (!row) throw notFound("Category");
  await audit(db, { adminId: c.get("admin").id, action: "category.update", entityType: "category", entityId: id, details: input, ip: clientIp(c) });
  return c.json(row);
});

adminTourRoutes.delete("/categories/:id", canWrite, async (c) => {
  const db = c.get("db");
  const id = parseId(c.req.param("id"), "Category");
  const row = await db.delete(tourCategories).where(eq(tourCategories.id, id)).returning().get();
  if (!row) throw notFound("Category");
  await audit(db, { adminId: c.get("admin").id, action: "category.delete", entityType: "category", entityId: id, details: { name: row.name }, ip: clientIp(c) });
  return c.json({ ok: true });
});
