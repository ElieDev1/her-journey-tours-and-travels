// Response shapes of the HTTP API, shared by the Worker and the client.
import type {
  AdminRole,
  BookingStatus,
  DepartureStatus,
  DifficultyLevel,
  FeeBasis,
  ImageKind,
  PaymentMethod,
  PaymentStatus,
  Permission,
  PricingBasis,
  TourListKind,
  TourStatus,
} from "./constants";
import type { Quote } from "./pricing";

export interface ApiError {
  error: string;
  /** Field-level validation messages, keyed by dotted path. */
  fields?: Record<string, string>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ImageDTO {
  id: number;
  kind: ImageKind;
  url: string;
  smallUrl: string | null;
  altText: string;
  width: number | null;
  height: number | null;
  isPlaceholder: boolean;
  sortOrder: number;
}

export interface CategoryDTO {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  tourCount?: number;
}

export interface DepartureDTO {
  id: number;
  tourId: number;
  startDate: string;
  endDate: string | null;
  departureTime: string | null;
  returnTime: string | null;
  bookingDeadline: string | null;
  /** Null when the number of seats has not been set. */
  seatCapacity: number | null;
  seatsReserved: number;
  seatsAvailable: number | null;
  adultPriceOverride: number | null;
  childPriceOverride: number | null;
  status: DepartureStatus;
  notes: string | null;
  /** True when a customer can book this departure right now. */
  bookable: boolean;
  /** Why the departure cannot be booked, when it cannot. */
  unavailableReason: string | null;
}

export interface PricingDTO {
  currency: string;
  pricingBasis: PricingBasis;
  adultPrice: number;
  childPrice: number | null;
  discountPrice: number | null;
  discountPercentage: number | null;
  additionalFees: number;
  additionalFeesBasis: FeeBasis;
  additionalFeesNote: string | null;
}

export interface TourCardDTO {
  id: number;
  slug: string;
  title: string;
  shortDescription: string | null;
  destination: string;
  country: string;
  category: { name: string; slug: string } | null;
  durationText: string | null;
  isFeatured: boolean;
  isPopular: boolean;
  pricing: PricingDTO;
  /** Price a customer pays per adult after discounts. */
  fromPrice: number;
  cover: ImageDTO | null;
  nextDeparture: DepartureDTO | null;
}

export type TourLists = Record<TourListKind, string[]>;

export interface TourDetailDTO extends TourCardDTO {
  description: string | null;
  districtProvince: string | null;
  location: string | null;
  mapUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  operatorName: string;
  durationDays: number | null;
  departureTime: string | null;
  returnTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  meals: string | null;
  transportation: string | null;
  entranceFees: string | null;
  guideInfo: string | null;
  specialRequirements: string | null;
  accommodation: string | null;
  accessibility: string | null;
  safetyInstructions: string | null;
  difficultyLevel: DifficultyLevel | null;
  minAge: number | null;
  maxAge: number | null;
  videoUrl: string | null;
  bookingPhone: string | null;
  alternativePhone: string | null;
  bookingEmail: string | null;
  whatsappNumber: string | null;
  maxGroupSize: number | null;
  minParticipants: number | null;
  bookingOpen: boolean;
  cancellationPolicy: string | null;
  terms: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  lists: TourLists;
  images: ImageDTO[];
  departures: DepartureDTO[];
  reviews: ReviewDTO[];
  rating: { average: number; count: number } | null;
}

export interface AdminTourDTO extends TourDetailDTO {
  status: TourStatus;
  categoryId: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  bookingCount: number;
}

export interface AdminTourRowDTO {
  id: number;
  slug: string;
  title: string;
  destination: string;
  status: TourStatus;
  isFeatured: boolean;
  isPopular: boolean;
  currency: string;
  adultPrice: number;
  categoryName: string | null;
  coverUrl: string | null;
  nextDepartureDate: string | null;
  departureCount: number;
  bookingCount: number;
  updatedAt: string;
}

export interface ReviewDTO {
  id: number;
  tourId: number | null;
  tourTitle?: string | null;
  authorName: string;
  authorLocation: string | null;
  rating: number;
  title: string | null;
  body: string;
  isPublished: boolean;
  isFeatured: boolean;
  createdAt: string;
}

export interface PublicSettingsDTO {
  companyName: string;
  tagline: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  whatsappNumber: string | null;
  contactEmail: string | null;
  address: string | null;
  momoPayCode: string;
  momoMerchantName: string;
  bookingHoldMinutes: number;
  heroTitle: string;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  aboutText: string | null;
  social: { instagram: string | null; facebook: string | null; tiktok: string | null };
}

export interface DestinationDTO {
  destination: string;
  country: string;
  tourCount: number;
  cover: ImageDTO | null;
  /** Slug of a tour at this destination, for linking. */
  sampleSlug: string;
}

export interface HomeDTO {
  featured: TourCardDTO[];
  upcoming: Array<{ tour: TourCardDTO; departure: DepartureDTO }>;
  categories: CategoryDTO[];
  destinations: DestinationDTO[];
  testimonials: ReviewDTO[];
}

export interface TourFiltersDTO {
  categories: CategoryDTO[];
  countries: string[];
  destinations: string[];
}

export interface PaymentDTO {
  id: number;
  bookingId: number;
  method: PaymentMethod;
  provider: string;
  merchantCode: string | null;
  transactionReference: string | null;
  payerPhone: string | null;
  amount: number;
  currency: string;
  paidAt: string | null;
  status: PaymentStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName?: string | null;
  rejectionReason: string | null;
  refundedAt: string | null;
  refundAmount: number | null;
  refundReference: string | null;
  adminNotes?: string | null;
  createdAt: string;
}

export interface PaymentInstructionsDTO {
  merchantName: string;
  momoPayCode: string;
  amountDue: number;
  currency: string;
  deadline: string | null;
  steps: string[];
}

export interface PublicBookingDTO {
  reference: string;
  status: BookingStatus;
  tour: { title: string; slug: string; destination: string; pickupLocation: string | null; meetingPoint: string | null };
  departure: { startDate: string; endDate: string | null; departureTime: string | null; returnTime: string | null };
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  adults: number;
  children: number;
  totalGuests: number;
  specialRequests: string | null;
  currency: string;
  adultUnitPrice: number;
  childUnitPrice: number;
  discountAmount: number;
  feesAmount: number;
  totalAmount: number;
  amountPaid: number;
  expiresAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  payments: PaymentDTO[];
  paymentInstructions: PaymentInstructionsDTO;
  contact: { phone: string | null; altPhone: string | null; whatsapp: string | null; email: string | null };
  canSubmitPayment: boolean;
}

export interface BookingCreatedDTO {
  reference: string;
  accessToken: string;
  status: BookingStatus;
  totalAmount: number;
  currency: string;
  expiresAt: string | null;
}

export interface AdminBookingRowDTO {
  id: number;
  reference: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  adults: number;
  children: number;
  totalGuests: number;
  totalAmount: number;
  currency: string;
  amountVerified: number;
  tourId: number;
  tourTitle: string;
  departureId: number;
  departureDate: string;
  expiresAt: string | null;
  createdAt: string;
  latestPaymentStatus: PaymentStatus | null;
}

export interface BookingGuestDTO {
  id: number;
  fullName: string;
  guestType: "adult" | "child";
  isLeadContact: boolean;
}

export interface AuditLogDTO {
  id: number;
  adminName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminBookingDetailDTO extends AdminBookingRowDTO {
  specialRequests: string | null;
  adultUnitPrice: number;
  childUnitPrice: number;
  discountAmount: number;
  feesAmount: number;
  seatsHeld: boolean;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  adminNotes: string | null;
  updatedAt: string;
  guests: BookingGuestDTO[];
  payments: PaymentDTO[];
  history: AuditLogDTO[];
  departure: DepartureDTO;
}

export interface AdminPaymentRowDTO extends PaymentDTO {
  bookingReference: string;
  bookingStatus: BookingStatus;
  bookingTotal: number;
  customerName: string;
  tourTitle: string;
  departureDate: string;
}

export interface AdminUserDTO {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionDTO {
  user: AdminUserDTO;
  permissions: Permission[];
}

export interface DashboardDTO {
  totals: {
    tours: number;
    publishedTours: number;
    upcomingDepartures: number;
    bookings: number;
    pendingPayments: number;
    confirmedBookings: number;
  };
  revenue: Array<{ currency: string; amount: number }>;
  recentBookings: AdminBookingRowDTO[];
  upcomingTrips: Array<{
    departure: DepartureDTO;
    tourTitle: string;
    tourId: number;
    confirmedGuests: number;
    heldGuests: number;
  }>;
}

export interface AdminSettingsDTO {
  values: Record<string, unknown>;
  heroImageUrl: string | null;
}

export type { Quote };

export interface CustomerDTO {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
}

export interface CustomerBookingDTO {
  reference: string;
  status: BookingStatus;
  tourTitle: string;
  tourSlug: string;
  departureDate: string;
  totalGuests: number;
  totalAmount: number;
  currency: string;
  amountPaid: number;
  /** Email on the booking; the booking page uses it to open the booking. */
  bookingEmail: string;
  createdAt: string;
}
