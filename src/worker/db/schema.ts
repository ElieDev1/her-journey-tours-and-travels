import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  ADMIN_ROLES,
  BOOKING_STATUSES,
  DEPARTURE_STATUSES,
  DIFFICULTY_LEVELS,
  FEE_BASES,
  IMAGE_KINDS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRICING_BASES,
  TOUR_LIST_KINDS,
  TOUR_STATUSES,
} from "../../shared/constants";

// All timestamps are ISO-8601 UTC strings, which sort lexicographically.
const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text("created_at").notNull().default(now);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(now)
    .$onUpdate(() => new Date().toISOString());

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ADMIN_ROLES }).notNull().default("staff"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    // SHA-256 of the session token; the raw token only lives in the cookie.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_sessions_admin_idx").on(t.adminId), index("admin_sessions_expires_idx").on(t.expiresAt)],
);

export const tourCategories = sqliteTable("tour_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tours = sqliteTable(
  "tours",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    shortDescription: text("short_description"),
    description: text("description"),
    categoryId: integer("category_id").references(() => tourCategories.id, { onDelete: "set null" }),
    status: text("status", { enum: TOUR_STATUSES }).notNull().default("draft"),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isPopular: integer("is_popular", { mode: "boolean" }).notNull().default(false),

    // Location
    destination: text("destination").notNull(),
    country: text("country").notNull().default("Rwanda"),
    districtProvince: text("district_province"),
    location: text("location"),
    mapUrl: text("map_url"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    operatorName: text("operator_name").notNull().default("Her Journey Tours and Travels"),

    // Default schedule (individual departures may override times)
    durationText: text("duration_text"),
    durationDays: integer("duration_days"),
    departureTime: text("departure_time"),
    returnTime: text("return_time"),
    pickupLocation: text("pickup_location"),
    meetingPoint: text("meeting_point"),

    // Pricing (minor units of `currency`)
    currency: text("currency").notNull().default("RWF"),
    pricingBasis: text("pricing_basis", { enum: PRICING_BASES }).notNull().default("per_person"),
    adultPrice: integer("adult_price").notNull(),
    childPrice: integer("child_price"),
    discountPrice: integer("discount_price"),
    discountPercentage: integer("discount_percentage"),
    additionalFees: integer("additional_fees").notNull().default(0),
    additionalFeesBasis: text("additional_fees_basis", { enum: FEE_BASES }).notNull().default("per_booking"),
    additionalFeesNote: text("additional_fees_note"),

    // Inclusions and features (lists live in tour_list_items)
    meals: text("meals"),
    transportation: text("transportation"),
    entranceFees: text("entrance_fees"),
    guideInfo: text("guide_info"),
    specialRequirements: text("special_requirements"),
    accommodation: text("accommodation"),
    accessibility: text("accessibility"),
    safetyInstructions: text("safety_instructions"),
    difficultyLevel: text("difficulty_level", { enum: DIFFICULTY_LEVELS }),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    videoUrl: text("video_url"),

    // Booking
    bookingPhone: text("booking_phone"),
    alternativePhone: text("alternative_phone"),
    bookingEmail: text("booking_email"),
    whatsappNumber: text("whatsapp_number"),
    maxGroupSize: integer("max_group_size"),
    minParticipants: integer("min_participants"),
    bookingOpen: integer("booking_open", { mode: "boolean" }).notNull().default(true),
    cancellationPolicy: text("cancellation_policy"),
    terms: text("terms"),

    // SEO
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),

    publishedAt: text("published_at"),
    createdBy: integer("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tours_status_idx").on(t.status),
    index("tours_category_idx").on(t.categoryId),
    index("tours_country_idx").on(t.country),
    check("tours_adult_price_check", sql`${t.adultPrice} >= 0`),
    check(
      "tours_discount_pct_check",
      sql`${t.discountPercentage} IS NULL OR (${t.discountPercentage} BETWEEN 0 AND 100)`,
    ),
  ],
);

export const tourListItems = sqliteTable(
  "tour_list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tourId: integer("tour_id")
      .notNull()
      .references(() => tours.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: TOUR_LIST_KINDS }).notNull(),
    text: text("text").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("tour_list_items_tour_idx").on(t.tourId, t.kind, t.sortOrder)],
);

export const tourImages = sqliteTable(
  "tour_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tourId: integer("tour_id")
      .notNull()
      .references(() => tours.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: IMAGE_KINDS }).notNull(),
    // Uploaded images live in R2; bundled placeholders use `externalUrl`.
    r2Key: text("r2_key"),
    r2KeySmall: text("r2_key_small"),
    externalUrl: text("external_url"),
    altText: text("alt_text").notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes"),
    isPlaceholder: integer("is_placeholder", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tour_images_tour_idx").on(t.tourId, t.kind, t.sortOrder),
    check("tour_images_source_check", sql`${t.r2Key} IS NOT NULL OR ${t.externalUrl} IS NOT NULL`),
  ],
);

export const tourDepartures = sqliteTable(
  "tour_departures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tourId: integer("tour_id")
      .notNull()
      .references(() => tours.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(), // YYYY-MM-DD, business timezone
    endDate: text("end_date"),
    departureTime: text("departure_time"), // HH:MM, overrides tour default
    returnTime: text("return_time"),
    bookingDeadline: text("booking_deadline"), // ISO datetime; null = until departure
    // Null capacity means the number of seats has not been set (no limit enforced).
    seatCapacity: integer("seat_capacity"),
    seatsReserved: integer("seats_reserved").notNull().default(0),
    adultPriceOverride: integer("adult_price_override"),
    childPriceOverride: integer("child_price_override"),
    status: text("status", { enum: DEPARTURE_STATUSES }).notNull().default("scheduled"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tour_departures_tour_date_uq").on(t.tourId, t.startDate),
    index("tour_departures_start_idx").on(t.startDate, t.status),
    check("tour_departures_seats_check", sql`${t.seatsReserved} >= 0`),
    check(
      "tour_departures_capacity_check",
      sql`${t.seatCapacity} IS NULL OR ${t.seatsReserved} <= ${t.seatCapacity}`,
    ),
  ],
);

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  lastLoginAt: text("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customerSessions = sqliteTable(
  "customer_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    // SHA-256 of the session token; the raw token only lives in the cookie.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("customer_sessions_customer_idx").on(t.customerId), index("customer_sessions_expires_idx").on(t.expiresAt)],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reference: text("reference").notNull().unique(),
    accessTokenHash: text("access_token_hash").notNull(),
    tourId: integer("tour_id")
      .notNull()
      .references(() => tours.id, { onDelete: "restrict" }),
    departureId: integer("departure_id")
      .notNull()
      .references(() => tourDepartures.id, { onDelete: "restrict" }),
    // Set when the booking was made while signed in to a customer account.
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    adults: integer("adults").notNull(),
    children: integer("children").notNull().default(0),
    totalGuests: integer("total_guests").notNull(),
    specialRequests: text("special_requests"),
    // Price snapshot at booking time (minor units)
    currency: text("currency").notNull(),
    adultUnitPrice: integer("adult_unit_price").notNull(),
    childUnitPrice: integer("child_unit_price").notNull(),
    discountAmount: integer("discount_amount").notNull().default(0),
    feesAmount: integer("fees_amount").notNull().default(0),
    totalAmount: integer("total_amount").notNull(),
    status: text("status", { enum: BOOKING_STATUSES }).notNull().default("pending_payment"),
    // True while this booking's guests are counted in departure.seats_reserved.
    seatsHeld: integer("seats_held", { mode: "boolean" }).notNull().default(true),
    expiresAt: text("expires_at"),
    confirmedAt: text("confirmed_at"),
    cancelledAt: text("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    adminNotes: text("admin_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_status_idx").on(t.status, t.expiresAt),
    index("bookings_departure_idx").on(t.departureId),
    index("bookings_tour_idx").on(t.tourId),
    index("bookings_email_idx").on(t.customerEmail),
    index("bookings_customer_idx").on(t.customerId),
    index("bookings_created_idx").on(t.createdAt),
    check("bookings_guests_check", sql`${t.adults} >= 0 AND ${t.children} >= 0 AND ${t.totalGuests} >= 1`),
  ],
);

export const bookingGuests = sqliteTable(
  "booking_guests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    guestType: text("guest_type", { enum: ["adult", "child"] }).notNull(),
    isLeadContact: integer("is_lead_contact", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("booking_guests_booking_idx").on(t.bookingId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    method: text("method", { enum: PAYMENT_METHODS }).notNull().default("momo_pay"),
    // Identifies the integration that produced this record ("manual" today;
    // e.g. "mtn_momo_api" once an official API is connected).
    provider: text("provider").notNull().default("manual"),
    merchantCode: text("merchant_code"),
    transactionReference: text("transaction_reference"),
    payerPhone: text("payer_phone"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    paidAt: text("paid_at"),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("pending"),
    submittedAt: text("submitted_at"),
    reviewedAt: text("reviewed_at"),
    reviewedBy: integer("reviewed_by").references(() => adminUsers.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    refundedAt: text("refunded_at"),
    refundAmount: integer("refund_amount"),
    refundReference: text("refund_reference"),
    adminNotes: text("admin_notes"),
    providerPayload: text("provider_payload"), // raw JSON from a future provider API
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_status_idx").on(t.status, t.submittedAt),
    index("payments_txn_idx").on(t.transactionReference),
    // A transaction reference may only back one live payment claim.
    uniqueIndex("payments_txn_live_uq")
      .on(t.method, t.transactionReference)
      .where(sql`${t.transactionReference} IS NOT NULL AND ${t.status} IN ('submitted', 'verified', 'refunded')`),
    check("payments_amount_check", sql`${t.amount} >= 0`),
  ],
);

export const tourReviews = sqliteTable(
  "tour_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tourId: integer("tour_id").references(() => tours.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    authorLocation: text("author_location"),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(false),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tour_reviews_tour_idx").on(t.tourId, t.isPublished),
    check("tour_reviews_rating_check", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON-encoded
  updatedBy: integer("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminId: integer("admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: text("details"), // JSON
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);
