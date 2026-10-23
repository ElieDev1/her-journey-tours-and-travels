import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { tourCategories, tourDepartures, tourImages, tourListItems, tourReviews, tours } from "../db/schema";
import { TOUR_LIST_KINDS, type TourListKind } from "../../shared/constants";
import { effectiveUnitPrices, type PriceInputs } from "../../shared/pricing";
import { businessDateTimeToIso, businessToday } from "../../shared/time";
import type { TourListQuery } from "../../shared/schemas";
import type {
  DepartureDTO,
  ImageDTO,
  PricingDTO,
  ReviewDTO,
  TourCardDTO,
  TourDetailDTO,
  TourLists,
} from "../../shared/types";
import { mediaUrl } from "./media";

export type TourRow = typeof tours.$inferSelect;
export type DepartureRow = typeof tourDepartures.$inferSelect;
export type ImageRow = typeof tourImages.$inferSelect;
type CategoryRef = { name: string; slug: string } | null;

// ---------- mapping ----------

export function imageToDTO(row: ImageRow): ImageDTO {
  return {
    id: row.id,
    kind: row.kind,
    url: row.r2Key ? mediaUrl(row.r2Key) : (row.externalUrl ?? ""),
    smallUrl: row.r2KeySmall ? mediaUrl(row.r2KeySmall) : null,
    altText: row.altText,
    width: row.width,
    height: row.height,
    isPlaceholder: row.isPlaceholder,
    sortOrder: row.sortOrder,
  };
}

export function pricingOf(tour: TourRow): PricingDTO {
  return {
    currency: tour.currency,
    pricingBasis: tour.pricingBasis,
    adultPrice: tour.adultPrice,
    childPrice: tour.childPrice,
    discountPrice: tour.discountPrice,
    discountPercentage: tour.discountPercentage,
    additionalFees: tour.additionalFees,
    additionalFeesBasis: tour.additionalFeesBasis,
    additionalFeesNote: tour.additionalFeesNote,
  };
}

/** Price inputs for a departure, applying any per-departure price override. */
export function priceInputsFor(tour: TourRow, departure?: DepartureRow): PriceInputs {
  const overridden = departure?.adultPriceOverride != null;
  return {
    currency: tour.currency,
    pricingBasis: tour.pricingBasis,
    adultPrice: departure?.adultPriceOverride ?? tour.adultPrice,
    childPrice: departure?.childPriceOverride ?? tour.childPrice,
    // An explicit discount price belongs to the tour's base price only.
    discountPrice: overridden ? null : tour.discountPrice,
    discountPercentage: tour.discountPercentage,
    additionalFees: tour.additionalFees,
    additionalFeesBasis: tour.additionalFeesBasis,
  };
}

/** The moment after which a departure can no longer be booked. */
export function bookingCutoff(departure: DepartureRow, tour: Pick<TourRow, "departureTime">): string {
  return (
    departure.bookingDeadline ??
    businessDateTimeToIso(departure.startDate, departure.departureTime ?? tour.departureTime)
  );
}

export function departureToDTO(
  d: DepartureRow,
  tour: Pick<TourRow, "departureTime" | "returnTime" | "bookingOpen" | "status">,
  now = new Date(),
): DepartureDTO {
  const seatsAvailable = d.seatCapacity == null ? null : Math.max(d.seatCapacity - d.seatsReserved, 0);
  let unavailableReason: string | null = null;
  if (tour.status !== "published") unavailableReason = "This tour is not open for booking";
  else if (d.status === "cancelled") unavailableReason = "This departure has been cancelled";
  else if (d.status === "completed") unavailableReason = "This departure has already taken place";
  else if (d.status === "closed" || !tour.bookingOpen) unavailableReason = "Bookings are closed";
  else if (now.toISOString() >= bookingCutoff(d, tour)) unavailableReason = "The booking deadline has passed";
  else if (seatsAvailable === 0) unavailableReason = "Sold out";

  return {
    id: d.id,
    tourId: d.tourId,
    startDate: d.startDate,
    endDate: d.endDate,
    departureTime: d.departureTime ?? tour.departureTime,
    returnTime: d.returnTime ?? tour.returnTime,
    bookingDeadline: d.bookingDeadline,
    seatCapacity: d.seatCapacity,
    seatsReserved: d.seatsReserved,
    seatsAvailable,
    adultPriceOverride: d.adultPriceOverride,
    childPriceOverride: d.childPriceOverride,
    status: d.status,
    notes: d.notes,
    bookable: unavailableReason === null,
    unavailableReason,
  };
}

export function reviewToDTO(r: typeof tourReviews.$inferSelect, tourTitle?: string | null): ReviewDTO {
  return {
    id: r.id,
    tourId: r.tourId,
    tourTitle,
    authorName: r.authorName,
    authorLocation: r.authorLocation,
    rating: r.rating,
    title: r.title,
    body: r.body,
    isPublished: r.isPublished,
    isFeatured: r.isFeatured,
    createdAt: r.createdAt,
  };
}

function toCard(
  tour: TourRow,
  category: CategoryRef,
  cover: ImageRow | undefined,
  next: DepartureRow | undefined,
): TourCardDTO {
  return {
    id: tour.id,
    slug: tour.slug,
    title: tour.title,
    shortDescription: tour.shortDescription,
    destination: tour.destination,
    country: tour.country,
    category,
    durationText: tour.durationText,
    isFeatured: tour.isFeatured,
    isPopular: tour.isPopular,
    pricing: pricingOf(tour),
    fromPrice: effectiveUnitPrices(priceInputsFor(tour)).adult,
    cover: cover ? imageToDTO(cover) : null,
    nextDeparture: next ? departureToDTO(next, tour) : null,
  };
}

// ---------- loaders ----------

/** Cover images for a set of tours (falls back to the first gallery image). */
async function loadCovers(db: Database, tourIds: number[]): Promise<Map<number, ImageRow>> {
  const map = new Map<number, ImageRow>();
  if (!tourIds.length) return map;
  const rows = await db
    .select()
    .from(tourImages)
    .where(and(inArray(tourImages.tourId, tourIds), inArray(tourImages.kind, ["cover", "gallery"])))
    .orderBy(asc(tourImages.kind), asc(tourImages.sortOrder), asc(tourImages.id));
  // "cover" sorts before "gallery", so the first row per tour wins.
  for (const row of rows) if (!map.has(row.tourId)) map.set(row.tourId, row);
  return map;
}

/** The next scheduled, future departure for each tour. */
async function loadNextDepartures(db: Database, tourIds: number[]): Promise<Map<number, DepartureRow>> {
  const map = new Map<number, DepartureRow>();
  if (!tourIds.length) return map;
  const rows = await db
    .select()
    .from(tourDepartures)
    .where(
      and(
        inArray(tourDepartures.tourId, tourIds),
        eq(tourDepartures.status, "scheduled"),
        gte(tourDepartures.startDate, businessToday()),
      ),
    )
    .orderBy(asc(tourDepartures.startDate));
  for (const row of rows) if (!map.has(row.tourId)) map.set(row.tourId, row);
  return map;
}

export async function buildCards(
  db: Database,
  rows: Array<{ tour: TourRow; category: CategoryRef }>,
): Promise<TourCardDTO[]> {
  const ids = rows.map((r) => r.tour.id);
  const [covers, nexts] = await Promise.all([loadCovers(db, ids), loadNextDepartures(db, ids)]);
  return rows.map((r) => toCard(r.tour, r.category, covers.get(r.tour.id), nexts.get(r.tour.id)));
}

/** SQL for the per-adult price a customer pays, used for price filters and sorting. */
const effectivePriceSql = sql<number>`COALESCE(${tours.discountPrice}, (${tours.adultPrice} * (100 - COALESCE(${tours.discountPercentage}, 0))) / 100)`;

export async function listPublishedTours(db: Database, q: TourListQuery) {
  const today = businessToday();
  const from = q.from && q.from > today ? q.from : today;
  const dateConds: SQL[] = [
    sql`d.tour_id = ${tours.id}`,
    sql`d.status = 'scheduled'`,
    sql`d.start_date >= ${from}`,
  ];
  if (q.to) dateConds.push(sql`d.start_date <= ${q.to}`);
  const nextDateSql = sql<string | null>`(SELECT MIN(d.start_date) FROM tour_departures d WHERE ${sql.join(dateConds, sql` AND `)})`;

  const conds: SQL[] = [eq(tours.status, "published")];
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    conds.push(
      sql`(${tours.title} LIKE ${like} OR ${tours.destination} LIKE ${like} OR ${tours.location} LIKE ${like} OR ${tours.districtProvince} LIKE ${like} OR ${tours.country} LIKE ${like})`,
    );
  }
  if (q.category) conds.push(eq(tourCategories.slug, q.category));
  if (q.country) conds.push(eq(tours.country, q.country));
  if (q.destination) conds.push(eq(tours.destination, q.destination));
  if (q.featured === "1") conds.push(eq(tours.isFeatured, true));
  if (q.minPrice !== undefined) conds.push(gte(effectivePriceSql, q.minPrice));
  if (q.maxPrice !== undefined) conds.push(lte(effectivePriceSql, q.maxPrice));
  if (q.from || q.to) conds.push(sql`${nextDateSql} IS NOT NULL`);

  const where = and(...conds);
  const order =
    q.sort === "price_asc"
      ? [asc(effectivePriceSql), asc(tours.id)]
      : q.sort === "price_desc"
        ? [desc(effectivePriceSql), asc(tours.id)]
        : q.sort === "newest"
          ? [desc(tours.publishedAt), desc(tours.id)]
          : [sql`${nextDateSql} IS NULL`, asc(nextDateSql), desc(tours.isFeatured), asc(tours.id)];

  const [rows, countRow] = await Promise.all([
    db
      .select({ tour: tours, categoryName: tourCategories.name, categorySlug: tourCategories.slug })
      .from(tours)
      .leftJoin(tourCategories, eq(tours.categoryId, tourCategories.id))
      .where(where)
      .orderBy(...order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ n: sql<number>`count(*)` })
      .from(tours)
      .leftJoin(tourCategories, eq(tours.categoryId, tourCategories.id))
      .where(where)
      .get(),
  ]);

  const items = await buildCards(
    db,
    rows.map((r) => ({
      tour: r.tour,
      category: r.categoryName && r.categorySlug ? { name: r.categoryName, slug: r.categorySlug } : null,
    })),
  );
  return { items, total: countRow?.n ?? 0 };
}

export function emptyLists(): TourLists {
  return Object.fromEntries(TOUR_LIST_KINDS.map((k) => [k, [] as string[]])) as unknown as TourLists;
}

/** Everything about one tour. `publicOnly` hides past/cancelled departures and unpublished reviews. */
export async function loadTourDetail(
  db: Database,
  tour: TourRow,
  publicOnly: boolean,
): Promise<TourDetailDTO> {
  const today = businessToday();
  const departureFilter = publicOnly
    ? and(
        eq(tourDepartures.tourId, tour.id),
        gte(tourDepartures.startDate, today),
        inArray(tourDepartures.status, ["scheduled", "closed"]),
      )
    : eq(tourDepartures.tourId, tour.id);
  const reviewFilter = publicOnly
    ? and(eq(tourReviews.tourId, tour.id), eq(tourReviews.isPublished, true))
    : eq(tourReviews.tourId, tour.id);

  const [category, listRows, imageRows, departureRows, reviewRows] = await Promise.all([
    tour.categoryId
      ? db
          .select({ name: tourCategories.name, slug: tourCategories.slug })
          .from(tourCategories)
          .where(eq(tourCategories.id, tour.categoryId))
          .get()
      : Promise.resolve(undefined),
    db
      .select()
      .from(tourListItems)
      .where(eq(tourListItems.tourId, tour.id))
      .orderBy(asc(tourListItems.sortOrder), asc(tourListItems.id)),
    db
      .select()
      .from(tourImages)
      .where(eq(tourImages.tourId, tour.id))
      .orderBy(asc(tourImages.sortOrder), asc(tourImages.id)),
    db.select().from(tourDepartures).where(departureFilter).orderBy(asc(tourDepartures.startDate)),
    db.select().from(tourReviews).where(reviewFilter).orderBy(desc(tourReviews.createdAt)).limit(50),
  ]);

  const lists = emptyLists();
  for (const item of listRows) lists[item.kind as TourListKind].push(item.text);

  const cover = imageRows.find((i) => i.kind === "cover") ?? imageRows.find((i) => i.kind === "gallery");
  const departures = departureRows.map((d) => departureToDTO(d, tour));
  const nextRow = departureRows.find((d) => d.status === "scheduled" && d.startDate >= today);
  const published = reviewRows.filter((r) => r.isPublished);
  const rating = published.length
    ? {
        average: Math.round((published.reduce((s, r) => s + r.rating, 0) / published.length) * 10) / 10,
        count: published.length,
      }
    : null;

  return {
    ...toCard(tour, category ?? null, cover, nextRow),
    description: tour.description,
    districtProvince: tour.districtProvince,
    location: tour.location,
    mapUrl: tour.mapUrl,
    latitude: tour.latitude,
    longitude: tour.longitude,
    operatorName: tour.operatorName,
    durationDays: tour.durationDays,
    departureTime: tour.departureTime,
    returnTime: tour.returnTime,
    pickupLocation: tour.pickupLocation,
    meetingPoint: tour.meetingPoint,
    meals: tour.meals,
    transportation: tour.transportation,
    entranceFees: tour.entranceFees,
    guideInfo: tour.guideInfo,
    specialRequirements: tour.specialRequirements,
    accommodation: tour.accommodation,
    accessibility: tour.accessibility,
    safetyInstructions: tour.safetyInstructions,
    difficultyLevel: tour.difficultyLevel,
    minAge: tour.minAge,
    maxAge: tour.maxAge,
    videoUrl: tour.videoUrl,
    bookingPhone: tour.bookingPhone,
    alternativePhone: tour.alternativePhone,
    bookingEmail: tour.bookingEmail,
    whatsappNumber: tour.whatsappNumber,
    maxGroupSize: tour.maxGroupSize,
    minParticipants: tour.minParticipants,
    bookingOpen: tour.bookingOpen,
    cancellationPolicy: tour.cancellationPolicy,
    terms: tour.terms,
    seoTitle: tour.seoTitle,
    seoDescription: tour.seoDescription,
    lists,
    images: imageRows.map(imageToDTO),
    departures,
    reviews: reviewRows.map((r) => reviewToDTO(r)),
    rating,
  };
}
