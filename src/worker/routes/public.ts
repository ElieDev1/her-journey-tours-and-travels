import { Hono } from "hono";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "../env";
import { tourCategories, tourDepartures, tourImages, tourReviews, tours } from "../db/schema";
import { parseJson, parseQuery, paginate, HttpError, notFound, clientIp } from "../lib/http";
import {
  bookingCreateSchema,
  bookingCredentialSchema,
  bookingLookupSchema,
  paymentSubmitSchema,
  reviewSubmitSchema,
  tourListQuerySchema,
} from "../../shared/schemas";
import type { DestinationDTO, HomeDTO, TourFiltersDTO } from "../../shared/types";
import { businessToday } from "../../shared/time";
import { buildCards, departureToDTO, imageToDTO, listPublishedTours, loadTourDetail, reviewToDTO } from "../services/tours";
import { loadSettings, toPublicSettings } from "../services/settings";
import { enforceRateLimit } from "../services/rateLimit";
import {
  bookingCreatedEmail,
  createBooking,
  expireStaleBookings,
  findBookingForCustomer,
  toPublicBooking,
} from "../services/bookings";
import { submitPayment } from "../services/payments";
import { sendEmail } from "../services/email";
import { currentCustomer } from "../services/customerAuth";

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get("/settings", async (c) => {
  c.header("cache-control", "public, max-age=60");
  return c.json(toPublicSettings(await loadSettings(c.get("db"))));
});

publicRoutes.get("/home", async (c) => {
  const db = c.get("db");
  const today = businessToday();

  const [featuredRows, upcomingRows, categories, destinationRows, testimonials] = await Promise.all([
    db
      .select({ tour: tours, name: tourCategories.name, slug: tourCategories.slug })
      .from(tours)
      .leftJoin(tourCategories, eq(tours.categoryId, tourCategories.id))
      .where(and(eq(tours.status, "published"), sql`(${tours.isFeatured} = 1 OR ${tours.isPopular} = 1)`))
      .orderBy(desc(tours.isFeatured), desc(tours.publishedAt))
      .limit(6),
    db
      .select({ departure: tourDepartures, tour: tours, name: tourCategories.name, slug: tourCategories.slug })
      .from(tourDepartures)
      .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
      .leftJoin(tourCategories, eq(tours.categoryId, tourCategories.id))
      .where(and(eq(tours.status, "published"), eq(tourDepartures.status, "scheduled"), gte(tourDepartures.startDate, today)))
      .orderBy(asc(tourDepartures.startDate))
      .limit(6),
    db
      .select({
        id: tourCategories.id,
        name: tourCategories.name,
        slug: tourCategories.slug,
        description: tourCategories.description,
        sortOrder: tourCategories.sortOrder,
        tourCount: sql<number>`(SELECT count(*) FROM tours t WHERE t.category_id = ${tourCategories.id} AND t.status = 'published')`,
      })
      .from(tourCategories)
      .orderBy(asc(tourCategories.sortOrder), asc(tourCategories.name)),
    db
      .select({
        destination: tours.destination,
        country: tours.country,
        tourCount: sql<number>`count(*)`,
        sampleId: sql<number>`min(${tours.id})`,
      })
      .from(tours)
      .where(eq(tours.status, "published"))
      .groupBy(tours.destination, tours.country)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({ review: tourReviews, tourTitle: tours.title })
      .from(tourReviews)
      .leftJoin(tours, eq(tourReviews.tourId, tours.id))
      .where(eq(tourReviews.isPublished, true))
      .orderBy(desc(tourReviews.isFeatured), desc(tourReviews.createdAt))
      .limit(6),
  ]);

  // Featured falls back to the newest published tours when none are flagged.
  let featuredSource = featuredRows;
  if (!featuredSource.length) {
    featuredSource = await db
      .select({ tour: tours, name: tourCategories.name, slug: tourCategories.slug })
      .from(tours)
      .leftJoin(tourCategories, eq(tours.categoryId, tourCategories.id))
      .where(eq(tours.status, "published"))
      .orderBy(desc(tours.publishedAt))
      .limit(6);
  }
  const toRef = (name: string | null, slug: string | null) => (name && slug ? { name, slug } : null);
  const featured = await buildCards(db, featuredSource.map((r) => ({ tour: r.tour, category: toRef(r.name, r.slug) })));
  const upcomingCards = await buildCards(db, upcomingRows.map((r) => ({ tour: r.tour, category: toRef(r.name, r.slug) })));

  const sampleIds = destinationRows.map((d) => d.sampleId);
  const [sampleTours, sampleImages] = sampleIds.length
    ? await Promise.all([
        db.select({ id: tours.id, slug: tours.slug }).from(tours).where(inArray(tours.id, sampleIds)),
        db
          .select()
          .from(tourImages)
          .where(and(inArray(tourImages.tourId, sampleIds), inArray(tourImages.kind, ["cover", "gallery"])))
          .orderBy(asc(tourImages.kind), asc(tourImages.sortOrder)),
      ])
    : [[], []];
  const destinations: DestinationDTO[] = destinationRows.map((d) => {
    const image = sampleImages.find((i) => i.tourId === d.sampleId);
    return {
      destination: d.destination,
      country: d.country,
      tourCount: d.tourCount,
      cover: image ? imageToDTO(image) : null,
      sampleSlug: sampleTours.find((t) => t.id === d.sampleId)?.slug ?? "",
    };
  });

  const body: HomeDTO = {
    featured,
    upcoming: upcomingRows.map((r, i) => ({ tour: upcomingCards[i]!, departure: departureToDTO(r.departure, r.tour) })),
    categories,
    destinations,
    testimonials: testimonials.map((t) => reviewToDTO(t.review, t.tourTitle)),
  };
  c.header("cache-control", "public, max-age=30");
  return c.json(body);
});

publicRoutes.get("/tours/filters", async (c) => {
  const db = c.get("db");
  const [categories, places] = await Promise.all([
    db.select().from(tourCategories).orderBy(asc(tourCategories.sortOrder)),
    db
      .selectDistinct({ country: tours.country, destination: tours.destination })
      .from(tours)
      .where(eq(tours.status, "published")),
  ]);
  const body: TourFiltersDTO = {
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      sortOrder: cat.sortOrder,
    })),
    countries: [...new Set(places.map((p) => p.country))].sort(),
    destinations: [...new Set(places.map((p) => p.destination))].sort(),
  };
  return c.json(body);
});

publicRoutes.get("/tours", async (c) => {
  const query = parseQuery(c, tourListQuerySchema);
  const { items, total } = await listPublishedTours(c.get("db"), query);
  return c.json(paginate(items, total, query.page, query.pageSize));
});

publicRoutes.get("/tours/:slug", async (c) => {
  const db = c.get("db");
  const tour = await db
    .select()
    .from(tours)
    .where(and(eq(tours.slug, c.req.param("slug")), eq(tours.status, "published")))
    .get();
  if (!tour) throw notFound("Tour");
  return c.json(await loadTourDetail(db, tour, true));
});

publicRoutes.post("/tours/:slug/reviews", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `review:${clientIp(c)}`, 3, 3600);
  const input = await parseJson(c, reviewSubmitSchema);
  const tour = await db
    .select({ id: tours.id })
    .from(tours)
    .where(and(eq(tours.slug, c.req.param("slug")), eq(tours.status, "published")))
    .get();
  if (!tour) throw notFound("Tour");
  // Reviews are held for moderation before they appear on the site.
  await db.insert(tourReviews).values({ ...input, tourId: tour.id, isPublished: false });
  return c.json({ ok: true }, 201);
});

// ---------- bookings ----------

publicRoutes.post("/bookings", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `booking:${clientIp(c)}`, 10, 3600);
  const input = await parseJson(c, bookingCreateSchema);
  const settings = toPublicSettings(await loadSettings(db));

  // Free seats held by abandoned bookings before checking availability.
  await expireStaleBookings(db, c.env.DB, 50);
  // Bookings made while signed in appear under the traveller's account.
  const customer = await currentCustomer(c, db);
  const { booking, accessToken } = await createBooking(
    db,
    c.env.DB,
    input,
    settings.bookingHoldMinutes,
    settings.momoPayCode,
    customer?.id ?? null,
  );

  const view = await toPublicBooking(db, booking, settings);
  const origin = c.env.PUBLIC_SITE_URL || new URL(c.req.url).origin;
  const link = `${origin}/booking/${booking.reference}?t=${encodeURIComponent(accessToken)}`;
  c.executionCtx.waitUntil(sendEmail(c.env, { to: booking.customerEmail, ...bookingCreatedEmail(view, link) }));

  return c.json(
    {
      reference: booking.reference,
      accessToken,
      status: booking.status,
      totalAmount: booking.totalAmount,
      currency: booking.currency,
      expiresAt: booking.expiresAt,
    },
    201,
  );
});

publicRoutes.post("/bookings/lookup", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `lookup:${clientIp(c)}`, 20, 900);
  const { reference, email } = await parseJson(c, bookingLookupSchema);
  const booking = await findBookingForCustomer(db, reference, { email });
  return c.json(await toPublicBooking(db, booking, toPublicSettings(await loadSettings(db))));
});

publicRoutes.post("/bookings/:reference/view", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `view:${clientIp(c)}`, 120, 900);
  const credential = await parseJson(c, bookingCredentialSchema);
  const booking = await findBookingForCustomer(db, c.req.param("reference"), credential);
  return c.json(await toPublicBooking(db, booking, toPublicSettings(await loadSettings(db))));
});

publicRoutes.post("/bookings/:reference/payments", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `payment:${clientIp(c)}`, 10, 3600);
  const input = await parseJson(c, paymentSubmitSchema);
  if (!input.token && !input.email) throw new HttpError(400, "A booking token or email is required");
  const booking = await findBookingForCustomer(db, c.req.param("reference"), input);
  const settings = toPublicSettings(await loadSettings(db));
  await submitPayment(db, booking, input, settings.momoPayCode);

  const notify = c.env.ADMIN_NOTIFY_EMAIL;
  if (notify) {
    c.executionCtx.waitUntil(
      sendEmail(c.env, {
        to: notify,
        subject: `Payment submitted for ${booking.reference}`,
        text: `${booking.customerName} submitted MoMo transaction ${input.transactionReference} for booking ${booking.reference}. Verify it in the admin dashboard.`,
      }),
    );
  }
  const fresh = await findBookingForCustomer(db, booking.reference, input);
  return c.json(await toPublicBooking(db, fresh, settings), 201);
});
