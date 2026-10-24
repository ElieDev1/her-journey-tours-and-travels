import { z } from "zod";
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
  TOUR_STATUSES,
} from "./constants";
import { CURRENCY_CODES } from "./money";

// ---------- primitives ----------

/** Optional free text: empty strings become null. */
const optText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const reqText = (max = 200) => z.string().trim().min(1, "Required").max(max);

const optInt = (min = 0, max = 1_000_000_000) => z.number().int().min(min).max(max).nullish().transform((v) => v ?? null);

const money = z.number().int("Must be a whole amount").min(0).max(10_000_000_000);

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)")
  .nullish()
  .transform((v) => v ?? null);

const dateYMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const optUrl = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http:// or https://");

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20)
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number");

const optPhone = z
  .string()
  .trim()
  .max(20)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\+?[0-9 ()-]{7,20}$/.test(v), "Enter a valid phone number");

const optEmail = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email");

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only");

// ---------- public: bookings & payments ----------

export const bookingCreateSchema = z
  .object({
    departureId: z.number().int().positive(),
    adults: z.number().int().min(0).max(200),
    children: z.number().int().min(0).max(200),
    customerName: reqText(120),
    customerEmail: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
    customerPhone: phoneSchema,
    specialRequests: optText(1000),
    guestNames: z.array(z.string().trim().max(120)).max(200).default([]),
    acceptTerms: z.literal(true, { error: "Please accept the booking terms" }),
  })
  .refine((v) => v.adults + v.children >= 1, { message: "Add at least one guest", path: ["adults"] })
  .refine((v) => v.adults >= 1 || v.children === 0, {
    message: "Children must be accompanied by at least one adult",
    path: ["adults"],
  });
export type BookingCreateInput = z.input<typeof bookingCreateSchema>;

/** Customers prove access to a booking with either the link token or their email. */
export const bookingCredentialSchema = z
  .object({
    token: z.string().trim().min(16).max(128).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  })
  .refine((v) => v.token || v.email, "A booking token or email is required");

export const bookingLookupSchema = z.object({
  reference: z.string().trim().toUpperCase().min(4).max(20),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
});

export const paymentSubmitSchema = z.object({
  token: z.string().trim().min(16).max(128).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  transactionReference: z
    .string()
    .trim()
    .min(4, "Enter the transaction ID from your MoMo SMS")
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only"),
  payerPhone: phoneSchema,
  amount: money.min(1, "Enter the amount you paid"),
  paidAt: dateYMD,
});
export type PaymentSubmitInput = z.input<typeof paymentSubmitSchema>;

export const reviewSubmitSchema = z.object({
  authorName: reqText(80),
  authorLocation: optText(80),
  rating: z.number().int().min(1).max(5),
  title: optText(120),
  body: z.string().trim().min(10, "Tell us a little more").max(2000),
});

// ---------- admin: auth & users ----------

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(1, "Required").max(200),
});

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Include letters and numbers");

export const adminSetupSchema = z.object({
  setupToken: z.string().min(1, "Enter the setup code").max(200),
  name: reqText(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const adminUserCreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: reqText(80),
  role: z.enum(ADMIN_ROLES),
  password: passwordSchema,
});

export const adminUserUpdateSchema = z.object({
  name: reqText(80).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

// ---------- admin: tours ----------

export const tourUpsertSchema = z
  .object({
    title: reqText(160),
    slug: slugSchema,
    shortDescription: optText(400),
    description: optText(20000),
    categoryId: optInt(1),
    status: z.enum(TOUR_STATUSES),
    isFeatured: z.boolean(),
    isPopular: z.boolean(),

    destination: reqText(160),
    country: reqText(80),
    districtProvince: optText(160),
    location: optText(200),
    mapUrl: optUrl,
    latitude: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
    longitude: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
    operatorName: reqText(160),

    durationText: optText(80),
    durationDays: optInt(1, 365),
    departureTime: timeHHMM,
    returnTime: timeHHMM,
    pickupLocation: optText(200),
    meetingPoint: optText(200),

    currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
    pricingBasis: z.enum(PRICING_BASES),
    adultPrice: money,
    childPrice: money.nullish().transform((v) => v ?? null),
    discountPrice: money.nullish().transform((v) => v ?? null),
    discountPercentage: optInt(0, 100),
    additionalFees: money,
    additionalFeesBasis: z.enum(FEE_BASES),
    additionalFeesNote: optText(300),

    meals: optText(500),
    transportation: optText(500),
    entranceFees: optText(500),
    guideInfo: optText(500),
    specialRequirements: optText(1000),
    accommodation: optText(1000),
    accessibility: optText(1000),
    safetyInstructions: optText(2000),
    difficultyLevel: z.enum(DIFFICULTY_LEVELS).nullish().transform((v) => v ?? null),
    minAge: optInt(0, 120),
    maxAge: optInt(0, 120),
    videoUrl: optUrl,

    bookingPhone: optPhone,
    alternativePhone: optPhone,
    bookingEmail: optEmail,
    whatsappNumber: optPhone,
    maxGroupSize: optInt(1, 1000),
    minParticipants: optInt(1, 1000),
    bookingOpen: z.boolean(),
    cancellationPolicy: optText(4000),
    terms: optText(4000),

    seoTitle: optText(70),
    seoDescription: optText(170),

    lists: z.object({
      included: z.array(reqText(200)).max(50),
      excluded: z.array(reqText(200)).max(50),
      highlight: z.array(reqText(200)).max(50),
      activity: z.array(reqText(200)).max(50),
      amenity: z.array(reqText(200)).max(50),
      what_to_bring: z.array(reqText(200)).max(50),
    }),
  })
  .refine((v) => v.discountPrice === null || v.discountPrice < v.adultPrice, {
    message: "Discount price must be lower than the adult price",
    path: ["discountPrice"],
  })
  .refine((v) => v.minAge === null || v.maxAge === null || v.minAge <= v.maxAge, {
    message: "Minimum age cannot exceed maximum age",
    path: ["minAge"],
  })
  .refine((v) => v.minParticipants === null || v.maxGroupSize === null || v.minParticipants <= v.maxGroupSize, {
    message: "Minimum participants cannot exceed the maximum group size",
    path: ["minParticipants"],
  });
export type TourUpsertInput = z.input<typeof tourUpsertSchema>;
export type TourUpsert = z.output<typeof tourUpsertSchema>;

export const tourFlagsSchema = z.object({
  status: z.enum(TOUR_STATUSES).optional(),
  isFeatured: z.boolean().optional(),
  isPopular: z.boolean().optional(),
});

export const departureUpsertSchema = z
  .object({
    startDate: dateYMD,
    endDate: dateYMD.nullish().transform((v) => v ?? null),
    departureTime: timeHHMM,
    returnTime: timeHHMM,
    bookingDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a date and time")
      .nullish()
      .transform((v) => v ?? null),
    seatCapacity: optInt(1, 10000),
    adultPriceOverride: money.nullish().transform((v) => v ?? null),
    childPriceOverride: money.nullish().transform((v) => v ?? null),
    status: z.enum(DEPARTURE_STATUSES),
    notes: optText(1000),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  });
export type DepartureUpsertInput = z.input<typeof departureUpsertSchema>;

export const categoryUpsertSchema = z.object({
  name: reqText(80),
  slug: slugSchema,
  description: optText(500),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const imageUpdateSchema = z.object({
  altText: z.string().trim().max(250).optional(),
  kind: z.enum(IMAGE_KINDS).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

// ---------- admin: bookings & payments ----------

export const adminBookingListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  tourId: z.coerce.number().int().positive().optional(),
  departureId: z.coerce.number().int().positive().optional(),
  from: dateYMD.optional(),
  to: dateYMD.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const bookingCancelSchema = z.object({ reason: reqText(500) });
export const bookingNotesSchema = z.object({ adminNotes: optText(4000) });

export const paymentListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const paymentVerifySchema = z.object({ notes: optText(1000) });
export const paymentRejectSchema = z.object({ reason: reqText(500) });
export const paymentRefundSchema = z.object({
  amount: money.min(1),
  refundReference: optText(64),
  notes: optText(1000),
});
export const manualPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: money.min(1),
  transactionReference: optText(64),
  payerPhone: optPhone,
  paidAt: dateYMD,
  notes: optText(1000),
});

// ---------- admin: content ----------

export const reviewAdminSchema = z.object({
  tourId: optInt(1),
  authorName: reqText(80),
  authorLocation: optText(80),
  rating: z.number().int().min(1).max(5),
  title: optText(120),
  body: z.string().trim().min(1).max(2000),
  isPublished: z.boolean(),
  isFeatured: z.boolean(),
});

export const reviewFlagsSchema = z.object({
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export const siteSettingsSchema = z.object({
  company_name: reqText(120),
  tagline: optText(200),
  phone_primary: optPhone,
  phone_secondary: optPhone,
  whatsapp_number: optPhone,
  contact_email: optEmail,
  address: optText(300),
  momo_pay_code: z.string().trim().regex(/^\d{3,12}$/, "Digits only"),
  momo_merchant_name: reqText(120),
  booking_hold_minutes: z.number().int().min(15).max(10080),
  hero_title: reqText(160),
  hero_subtitle: optText(400),
  about_text: optText(3000),
  social_instagram: optUrl,
  social_facebook: optUrl,
  social_tiktok: optUrl,
});
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;

// ---------- public: listing ----------

export const tourListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).optional(),
  destination: z.string().trim().max(160).optional(),
  from: dateYMD.optional(),
  to: dateYMD.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  featured: z.enum(["1", "0"]).optional(),
  sort: z.enum(["upcoming", "price_asc", "price_desc", "newest"]).default("upcoming"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type TourListQuery = z.output<typeof tourListQuerySchema>;

// ---------- customer accounts ----------

export const customerPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Include letters and numbers");

export const customerRegisterSchema = z.object({
  fullName: reqText(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: optPhone,
  password: customerPasswordSchema,
});

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(1, "Required").max(200),
});

export const customerProfileSchema = z.object({
  fullName: reqText(120),
  phone: optPhone,
});

export const customerPasswordChangeSchema = z.object({
  // Optional only for accounts that have no password yet (Google sign-in).
  currentPassword: z.string().max(200).optional(),
  newPassword: customerPasswordSchema,
});

export const passwordForgotSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
});

export const passwordResetSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: customerPasswordSchema,
});

export const adminCustomerListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  method: z.enum(["password", "google"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const customerDisableSchema = z.object({ reason: reqText(300) });
