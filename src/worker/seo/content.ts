// Server-rendered, crawlable content for public pages. Everything here comes
// from the database or site settings; nothing is invented.
import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { siteSettings, tourCategories, tourReviews, tours } from "../db/schema";
import { formatMoney } from "../../shared/money";
import { formatDate, formatTime } from "../../shared/time";
import type { CategoryDTO, PublicSettingsDTO, ReviewDTO, TourCardDTO } from "../../shared/types";
import { listPublishedTours, reviewToDTO } from "../services/tours";
import { escapeHtml } from "./shell";

const DEFAULT_LOCALITY = "Kigali";

/** Local Rwandan numbers (07…) to international format (+2507…). */
export function intlPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("250")) return `+${digits}`;
  if (digits.startsWith("0")) return `+250${digits.slice(1)}`;
  return digits;
}

const priceText = (t: TourCardDTO) =>
  `From ${formatMoney(t.fromPrice, t.pricing.currency)} ${t.pricing.pricingBasis === "per_person" ? "per person" : "per group"}`;

const dateText = (t: TourCardDTO) =>
  t.nextDeparture
    ? `${formatDate(t.nextDeparture.startDate, true)}${t.nextDeparture.departureTime ? `, departing ${formatTime(t.nextDeparture.departureTime)}` : ""}`
    : "Dates to be announced";

// ---------- data ----------

export async function loadPublishedCards(db: Database): Promise<TourCardDTO[]> {
  const { items } = await listPublishedTours(db, { sort: "upcoming", page: 1, pageSize: 500 });
  return items;
}

export async function loadCategoriesWithTours(db: Database): Promise<CategoryDTO[]> {
  const rows = await db
    .select({
      id: tourCategories.id,
      name: tourCategories.name,
      slug: tourCategories.slug,
      description: tourCategories.description,
      sortOrder: tourCategories.sortOrder,
      tourCount: sql<number>`(SELECT count(*) FROM tours t WHERE t.category_id = ${tourCategories.id} AND t.status = 'published')`,
    })
    .from(tourCategories)
    .orderBy(tourCategories.sortOrder);
  return rows.filter((r) => r.tourCount > 0);
}

export async function loadTestimonials(db: Database): Promise<ReviewDTO[]> {
  const rows = await db
    .select({ review: tourReviews, tourTitle: tours.title })
    .from(tourReviews)
    .leftJoin(tours, eq(tourReviews.tourId, tours.id))
    .where(eq(tourReviews.isPublished, true))
    .orderBy(desc(tourReviews.isFeatured), desc(tourReviews.createdAt))
    .limit(6);
  return rows.map((r) => reviewToDTO(r.review, r.tourTitle));
}

export interface LastModified {
  tours: Map<string, string>;
  toursIndex: string;
  home: string;
  settings: string;
}

/**
 * Last-modified time of each public URL: a tour page changes when the tour,
 * its departures (dates, availability), images or published reviews change.
 */
export async function loadLastModified(db: Database): Promise<LastModified> {
  const [tourRows, aggregate] = await Promise.all([
    db.all<{ slug: string; lastmod: string }>(sql`
      SELECT t.slug AS slug, max(
        t.updated_at,
        COALESCE((SELECT max(d.updated_at) FROM tour_departures d WHERE d.tour_id = t.id), ''),
        COALESCE((SELECT max(i.updated_at) FROM tour_images i WHERE i.tour_id = t.id), ''),
        COALESCE((SELECT max(r.updated_at) FROM tour_reviews r WHERE r.tour_id = t.id AND r.is_published = 1), '')
      ) AS lastmod
      FROM tours t WHERE t.status = 'published'`),
    db
      .select({
        anyTour: sql<string | null>`(SELECT max(updated_at) FROM ${tours})`,
        categories: sql<string | null>`(SELECT max(updated_at) FROM ${tourCategories})`,
        settings: sql<string | null>`(SELECT max(updated_at) FROM ${siteSettings})`,
        reviews: sql<string | null>`(SELECT max(updated_at) FROM ${tourReviews} WHERE is_published = 1)`,
      })
      .from(sql`(SELECT 1)`)
      .get(),
  ]);
  const tourMap = new Map(tourRows.map((r) => [r.slug, r.lastmod]));
  const latest = (...values: Array<string | null | undefined>) => values.filter((v): v is string => Boolean(v)).sort().pop() ?? new Date(0).toISOString();
  // Unpublishing a tour bumps its updated_at, so the index reflects removals too.
  const toursIndex = latest(...tourMap.values(), aggregate?.anyTour, aggregate?.categories);
  return {
    tours: tourMap,
    toursIndex,
    home: latest(toursIndex, aggregate?.settings, aggregate?.reviews),
    settings: latest(aggregate?.settings),
  };
}

// ---------- JSON-LD ----------

export function organizationLd(settings: PublicSettingsDTO, origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    "@id": `${origin}/#organization`,
    name: settings.companyName,
    url: origin,
    logo: `${origin}/brand/logo-512.png`,
    image: `${origin}/brand/logo-1200.png`,
    ...(settings.phonePrimary ? { telephone: intlPhone(settings.phonePrimary) } : {}),
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
    address: {
      "@type": "PostalAddress",
      ...(settings.address ? { streetAddress: settings.address } : {}),
      addressLocality: DEFAULT_LOCALITY,
      addressCountry: "RW",
    },
    // Filled automatically once social profile links are added in Site settings.
    sameAs: [settings.social.instagram, settings.social.facebook, settings.social.tiktok].filter(Boolean),
  };
}

export function toursItemListLd(cards: TourCardDTO[], origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Tours",
    numberOfItems: cards.length,
    itemListElement: cards.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${origin}/tours/${t.slug}`,
      name: t.title,
    })),
  };
}

export function breadcrumbLd(origin: string, trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({ "@type": "ListItem", position: i + 1, name: step.name, item: `${origin}${step.path}` })),
  };
}

// ---------- HTML ----------

function tourItem(t: TourCardDTO, headingTag: "h2" | "h3"): string {
  return [
    `<li><article>`,
    `<${headingTag}><a href="/tours/${escapeHtml(t.slug)}">${escapeHtml(t.title)}</a></${headingTag}>`,
    `<p>${escapeHtml(t.destination)}, ${escapeHtml(t.country)}${t.category ? ` · ${escapeHtml(t.category.name)}` : ""}</p>`,
    `<p>${escapeHtml(dateText(t))} · ${escapeHtml(priceText(t))}${t.durationText ? ` · ${escapeHtml(t.durationText)}` : ""}</p>`,
    t.shortDescription ? `<p>${escapeHtml(t.shortDescription)}</p>` : "",
    `<p><a href="/tours/${escapeHtml(t.slug)}">View details and book: ${escapeHtml(t.title)}</a></p>`,
    `</article></li>`,
  ].join("");
}

function contactList(s: PublicSettingsDTO): string {
  const items = [
    s.phonePrimary && `<li>Phone: <a href="tel:${escapeHtml(intlPhone(s.phonePrimary))}">${escapeHtml(s.phonePrimary)}</a></li>`,
    s.phoneSecondary && `<li>Alternative phone: <a href="tel:${escapeHtml(intlPhone(s.phoneSecondary))}">${escapeHtml(s.phoneSecondary)}</a></li>`,
    s.whatsappNumber && `<li>WhatsApp: <a href="https://wa.me/${escapeHtml(intlPhone(s.whatsappNumber).replace("+", ""))}">${escapeHtml(s.whatsappNumber)}</a></li>`,
    s.contactEmail && `<li>Email: <a href="mailto:${escapeHtml(s.contactEmail)}">${escapeHtml(s.contactEmail)}</a></li>`,
    `<li>Location: ${s.address ? `${escapeHtml(s.address)}, ` : ""}${DEFAULT_LOCALITY}, Rwanda</li>`,
    s.momoPayCode && `<li>MTN MoMo Pay merchant code: ${escapeHtml(s.momoPayCode)} (${escapeHtml(s.momoMerchantName)})</li>`,
  ].filter(Boolean);
  return `<ul>${items.join("")}</ul>`;
}

export function homeBody(s: PublicSettingsDTO, cards: TourCardDTO[], categories: CategoryDTO[], testimonials: ReviewDTO[]): string {
  const upcoming = cards.filter((t) => t.nextDeparture);
  const name = escapeHtml(s.companyName);
  return [
    `<main>`,
    `<h1>${escapeHtml(s.heroTitle)}</h1>`,
    s.heroSubtitle ? `<p>${escapeHtml(s.heroSubtitle)}</p>` : "",
    `<p><a href="/tours">Explore all tours</a></p>`,
    `<section><h2>About ${name}</h2>`,
    `<p>${name} is a tour and travel company based in ${DEFAULT_LOCALITY}, Rwanda.</p>`,
    s.aboutText ? `<p>${escapeHtml(s.aboutText)}</p>` : "",
    `</section>`,
    `<section><h2>What we offer</h2><ul>`,
    `<li><strong>Guided tours</strong> in Rwanda, led by our team.</li>`,
    `<li><strong>Weekend escapes</strong>: short trips out of ${DEFAULT_LOCALITY}.</li>`,
    `<li><strong>Scheduled group trips</strong> on fixed departure dates that you can join on your own, with family or with friends. Reserve your seats online.</li>`,
    `<li><strong>Simple payment with MTN MoMo Pay</strong>${s.momoPayCode ? ` (merchant code ${escapeHtml(s.momoPayCode)})` : ""}. Your booking is confirmed once we verify your payment.</li>`,
    `</ul></section>`,
    `<section><h2>Upcoming tours</h2>`,
    upcoming.length
      ? `<ul>${upcoming.map((t) => tourItem(t, "h3")).join("")}</ul>`
      : `<p>New departure dates are announced regularly. <a href="/tours">See all tours</a> or contact us to plan a trip.</p>`,
    `</section>`,
    categories.length
      ? `<section><h2>Tour categories</h2><ul>${categories
          .map((cat) => `<li><a href="/tours?category=${escapeHtml(cat.slug)}">${escapeHtml(cat.name)}</a>${cat.description ? ` – ${escapeHtml(cat.description)}` : ""} (${cat.tourCount} tour${cat.tourCount === 1 ? "" : "s"})</li>`)
          .join("")}</ul></section>`
      : "",
    testimonials.length
      ? `<section><h2>What our travellers say</h2>${testimonials
          .map((r) => `<blockquote><p>${escapeHtml(r.body)}</p><footer>${escapeHtml(r.authorName)}${r.authorLocation ? `, ${escapeHtml(r.authorLocation)}` : ""}${r.tourTitle ? ` – ${escapeHtml(r.tourTitle)}` : ""} (${r.rating}/5)</footer></blockquote>`)
          .join("")}</section>`
      : "",
    `<section><h2>Contact ${name}</h2>${contactList(s)}<p><a href="/contact">Contact page</a> · <a href="/booking/lookup">Find my booking</a></p></section>`,
    `</main>`,
  ].join("");
}

export function toursBody(s: PublicSettingsDTO, cards: TourCardDTO[]): string {
  return [
    `<main>`,
    `<nav aria-label="Breadcrumb"><a href="/">Home</a> › Tours</nav>`,
    `<h1>Tours and scheduled trips in Rwanda</h1>`,
    `<p>All tours currently offered by ${escapeHtml(s.companyName)}, with the next departure date and price. Choose a tour to see full details, availability and to book online.</p>`,
    cards.length ? `<ul>${cards.map((t) => tourItem(t, "h2")).join("")}</ul>` : `<p>No tours are published at the moment. Please contact us to plan a trip.</p>`,
    `<section><h2>Questions?</h2>${contactList(s)}</section>`,
    `</main>`,
  ].join("");
}

export function contactBody(s: PublicSettingsDTO): string {
  return [
    `<main>`,
    `<h1>Contact ${escapeHtml(s.companyName)}</h1>`,
    `<p>Questions about a tour, group bookings or payments? Reach us by phone, WhatsApp or email.</p>`,
    contactList(s),
    `<p><a href="/tours">Explore tours</a> · <a href="/booking/lookup">Find my booking</a></p>`,
    `</main>`,
  ].join("");
}

export function legalBody(s: PublicSettingsDTO, kind: "privacy" | "terms", lastUpdated: string): string {
  const title = kind === "privacy" ? "Privacy Policy" : "Terms and Conditions";
  const intro =
    kind === "privacy"
      ? `This policy explains what personal data ${escapeHtml(s.companyName)} collects when you use our website or book a trip, why we use it, and your rights under Rwanda's data protection law.`
      : `These terms apply when you use our website and when you book a tour with ${escapeHtml(s.companyName)}.`;
  return [
    `<main><h1>${title}</h1><p>${intro}</p><p>Last updated: ${escapeHtml(lastUpdated)}</p>`,
    `<h2>Contact</h2>${contactList(s)}`,
    `<p><a href="/${kind === "privacy" ? "terms" : "privacy"}">${kind === "privacy" ? "Terms and Conditions" : "Privacy Policy"}</a></p></main>`,
  ].join("");
}
