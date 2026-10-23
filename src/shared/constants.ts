// Domain constants shared by the Worker API and the React client.

/** Rwanda observes Central Africa Time (UTC+02:00) all year, with no DST. */
export const BUSINESS_TIMEZONE = "Africa/Kigali";
export const BUSINESS_UTC_OFFSET = "+02:00";

export const TOUR_STATUSES = ["draft", "published", "archived"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export const DEPARTURE_STATUSES = ["scheduled", "closed", "cancelled", "completed"] as const;
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number];

export const BOOKING_STATUSES = [
  "pending_payment",
  "payment_submitted",
  "confirmed",
  "cancelled",
  "expired",
  "refunded",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Booking statuses that hold seats on a departure. */
export const SEAT_HOLDING_STATUSES: readonly BookingStatus[] = [
  "pending_payment",
  "payment_submitted",
  "confirmed",
];

export const PAYMENT_STATUSES = ["pending", "submitted", "verified", "rejected", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["momo_pay", "cash", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PRICING_BASES = ["per_person", "per_group"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const FEE_BASES = ["per_booking", "per_person"] as const;
export type FeeBasis = (typeof FEE_BASES)[number];

export const DIFFICULTY_LEVELS = ["easy", "moderate", "challenging", "strenuous"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const IMAGE_KINDS = ["cover", "gallery", "poster"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/** Repeatable list fields of a tour, stored as rows in `tour_list_items`. */
export const TOUR_LIST_KINDS = [
  "included",
  "excluded",
  "highlight",
  "activity",
  "amenity",
  "what_to_bring",
] as const;
export type TourListKind = (typeof TOUR_LIST_KINDS)[number];

export const ADMIN_ROLES = ["owner", "manager", "staff"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  "tours:write",
  "bookings:write",
  "payments:verify",
  "payments:refund",
  "content:write",
  "settings:write",
  "users:manage",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    "tours:write",
    "bookings:write",
    "payments:verify",
    "payments:refund",
    "content:write",
    "audit:read",
  ],
  staff: ["bookings:write", "payments:verify"],
};

export function roleCan(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Pending Payment",
  payment_submitted: "Payment Submitted",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  refunded: "Refunded",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  momo_pay: "MoMo Pay",
  cash: "Cash",
  bank_transfer: "Bank transfer",
};

export const TOUR_STATUS_LABELS: Record<TourStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const DEPARTURE_STATUS_LABELS: Record<DepartureStatus, string> = {
  scheduled: "Scheduled",
  closed: "Closed",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const TOUR_LIST_LABELS: Record<TourListKind, string> = {
  included: "Included services",
  excluded: "Excluded services",
  highlight: "Highlights",
  activity: "Activities",
  amenity: "Amenities",
  what_to_bring: "What to bring",
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
