import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { tours } from "../db/schema";
import { loadSettings, toPublicSettings } from "../services/settings";
import { loadTourDetail } from "../services/tours";
import { formatMoney, toMajor } from "../../shared/money";
import { formatDate, formatTime } from "../../shared/time";
import { effectiveUnitPrices } from "../../shared/pricing";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_LABEL } from "../../shared/legal";
import type { PublicSettingsDTO, TourDetailDTO } from "../../shared/types";
import { escapeHtml, renderShell, siteOrigin } from "../seo/shell";
import {
  breadcrumbLd,
  contactBody,
  homeBody,
  legalBody,
  loadCategoriesWithTours,
  loadLastModified,
  loadPublishedCards,
  loadTestimonials,
  organizationLd,
  toursBody,
  toursItemListLd,
} from "../seo/content";

/** Server-rendered metadata and crawlable content for public pages, plus sitemap and robots. */
export const seoRoutes = new Hono<AppEnv>();

async function publicSettings(c: Context<AppEnv>): Promise<PublicSettingsDTO> {
  return toPublicSettings(await loadSettings(c.get("db")));
}

seoRoutes.get("/", async (c) => {
  const db = c.get("db");
  const [settings, cards, categories, testimonials] = await Promise.all([
    publicSettings(c),
    loadPublishedCards(db),
    loadCategoriesWithTours(db),
    loadTestimonials(db),
  ]);
  const origin = siteOrigin(c);
  return renderShell(c, {
    title: `${settings.companyName} | Guided Tours & Trips in Rwanda`,
    description: settings.heroSubtitle ?? `${settings.companyName}: guided tours and scheduled trips in Rwanda.`,
    path: "/",
    image: settings.heroImageUrl ?? undefined,
    jsonLd: [organizationLd(settings, origin), { "@context": "https://schema.org", "@type": "WebSite", name: settings.companyName, url: origin }],
    body: homeBody(settings, cards, categories, testimonials),
  });
});

seoRoutes.get("/tours", async (c) => {
  const [settings, cards] = await Promise.all([publicSettings(c), loadPublishedCards(c.get("db"))]);
  const origin = siteOrigin(c);
  const names = cards.slice(0, 3).map((t) => t.title).join(", ");
  return renderShell(c, {
    title: `Tours in Rwanda | ${settings.companyName}`,
    description: `Browse ${cards.length} tour${cards.length === 1 ? "" : "s"} and scheduled trips in Rwanda${names ? `, including ${names}` : ""}. See dates and prices in RWF and book online.`.slice(0, 300),
    path: "/tours",
    jsonLd: [
      organizationLd(settings, origin),
      toursItemListLd(cards, origin),
      breadcrumbLd(origin, [{ name: "Home", path: "/" }, { name: "Tours", path: "/tours" }]),
    ],
    body: toursBody(settings, cards),
  });
});

function tourDescription(t: TourDetailDTO): string {
  return (t.seoDescription ?? t.shortDescription ?? `${t.title} in ${t.destination}`).slice(0, 300);
}

function tourBody(t: TourDetailDTO, settings: PublicSettingsDTO): string {
  const price = formatMoney(t.fromPrice, t.pricing.currency);
  const dates = t.departures
    .map((d) => `<li>${escapeHtml(formatDate(d.startDate, true))}${d.departureTime ? ` – ${formatTime(d.departureTime)}` : ""}</li>`)
    .join("");
  const list = (items: string[]) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return [
    `<main><nav aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/tours">Tours</a> › ${escapeHtml(t.title)}</nav><article>`,
    `<h1>${escapeHtml(t.title)}</h1>`,
    `<p>${escapeHtml(t.destination)}, ${escapeHtml(t.country)}</p>`,
    t.shortDescription ? `<p>${escapeHtml(t.shortDescription)}</p>` : "",
    `<p>From ${escapeHtml(price)} ${t.pricing.pricingBasis === "per_person" ? "per person" : "per group"}</p>`,
    dates ? `<h2>Departures</h2><ul>${dates}</ul>` : "",
    t.pickupLocation ? `<p>Pickup: ${escapeHtml(t.pickupLocation)}</p>` : "",
    t.lists.highlight.length ? `<h2>Highlights</h2><ul>${list(t.lists.highlight)}</ul>` : "",
    t.lists.included.length ? `<h2>Included</h2><ul>${list(t.lists.included)}</ul>` : "",
    t.lists.excluded.length ? `<h2>Not included</h2><ul>${list(t.lists.excluded)}</ul>` : "",
    t.description ? `<div>${escapeHtml(t.description).replace(/\n/g, "<br />")}</div>` : "",
    `<p><a href="/tours/${escapeHtml(t.slug)}/book">Book this tour</a> · Call ${escapeHtml(t.bookingPhone ?? settings.phonePrimary ?? "")}</p>`,
    `</article></main>`,
  ].join("");
}

seoRoutes.get("/tours/:slug", async (c) => {
  const db = c.get("db");
  const tour = await db
    .select()
    .from(tours)
    .where(and(eq(tours.slug, c.req.param("slug")), eq(tours.status, "published")))
    .get();
  const settings = await publicSettings(c);
  if (!tour) {
    return renderShell(
      c,
      {
        title: `Tour not found | ${settings.companyName}`,
        description: "This tour is no longer available.",
        path: new URL(c.req.url).pathname,
        noindex: true,
        body: `<main><h1>Tour not found</h1><p><a href="/tours">See all tours</a></p></main>`,
      },
      404,
    );
  }
  const t = await loadTourDetail(db, tour, true);
  const origin = siteOrigin(c);
  const cover = t.images.find((i) => i.kind === "cover") ?? t.images[0];
  const prices = effectiveUnitPrices({ ...t.pricing });
  const jsonLd = [
    organizationLd(settings, origin),
    {
      "@context": "https://schema.org",
      "@type": "TouristTrip",
      name: t.title,
      description: tourDescription(t),
      url: `${origin}/tours/${t.slug}`,
      ...(cover ? { image: cover.url.startsWith("http") ? cover.url : `${origin}${cover.url}` } : {}),
      touristType: t.category?.name,
      provider: { "@id": `${origin}/#organization` },
      itinerary: { "@type": "Place", name: t.destination, address: { "@type": "PostalAddress", addressCountry: t.country } },
      offers: t.departures.map((d) => ({
        "@type": "Offer",
        price: toMajor(d.adultPriceOverride ?? prices.adult, t.pricing.currency),
        priceCurrency: t.pricing.currency,
        availability: d.bookable ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        validThrough: d.bookingDeadline ?? `${d.startDate}T${d.departureTime ?? "00:00"}:00+02:00`,
        url: `${origin}/tours/${t.slug}`,
      })),
      ...(t.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: t.rating.average, reviewCount: t.rating.count } } : {}),
    },
    breadcrumbLd(origin, [
      { name: "Home", path: "/" },
      { name: "Tours", path: "/tours" },
      { name: t.title, path: `/tours/${t.slug}` },
    ]),
  ];
  return renderShell(c, {
    title: t.seoTitle ?? `${t.title} | ${settings.companyName}`,
    description: tourDescription(t),
    path: `/tours/${t.slug}`,
    image: cover && !cover.url.endsWith(".svg") ? cover.url : undefined,
    type: "product",
    jsonLd,
    body: tourBody(t, settings),
  });
});

// Registered after /tours/:slug. The booking form is a client-side step and is not indexed.
seoRoutes.get("/tours/:slug/:page{.+}", async (c) => {
  const settings = await publicSettings(c);
  return renderShell(c, {
    title: `Book a tour | ${settings.companyName}`,
    description: "Reserve your seats and pay with MoMo Pay.",
    path: new URL(c.req.url).pathname,
    noindex: true,
    body: `<main><h1>Book a tour</h1><p><a href="/tours/${escapeHtml(c.req.param("slug"))}">Back to the tour</a></p></main>`,
  });
});

seoRoutes.get("/contact", async (c) => {
  const settings = await publicSettings(c);
  const origin = siteOrigin(c);
  return renderShell(c, {
    title: `Contact | ${settings.companyName}`,
    description: `Call, WhatsApp or email ${settings.companyName} in Kigali, Rwanda to plan your trip or ask about a booking.`,
    path: "/contact",
    jsonLd: [organizationLd(settings, origin), breadcrumbLd(origin, [{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])],
    body: contactBody(settings),
  });
});

for (const kind of ["privacy", "terms"] as const) {
  seoRoutes.get(`/${kind}`, async (c) => {
    const settings = await publicSettings(c);
    const title = kind === "privacy" ? "Privacy Policy" : "Terms and Conditions";
    return renderShell(c, {
      title: `${title} | ${settings.companyName}`,
      description:
        kind === "privacy"
          ? `How ${settings.companyName} collects, uses and protects your personal data.`
          : `The terms that apply when you book a tour with ${settings.companyName}.`,
      path: `/${kind}`,
      body: legalBody(settings, kind, LEGAL_LAST_UPDATED_LABEL),
    });
  });
}

// Private and utility pages: real titles, but kept out of search results.
const NOINDEX_PAGES: Array<[string, string]> = [
  ["/login", "Log in"],
  ["/register", "Create an account"],
  ["/forgot-password", "Forgot password"],
  ["/reset-password", "Choose a new password"],
  ["/account", "My account"],
  ["/booking/lookup", "Find my booking"],
  ["/booking/:reference", "Your booking"],
];
for (const [path, title] of NOINDEX_PAGES) {
  seoRoutes.get(path, async (c) => {
    const settings = await publicSettings(c);
    return renderShell(c, {
      title: `${title} | ${settings.companyName}`,
      description: `${title} – ${settings.companyName}.`,
      path: new URL(c.req.url).pathname,
      noindex: true,
      body: `<main><h1>${escapeHtml(title)}</h1><p><a href="/tours">Explore tours</a></p></main>`,
    });
  });
}

seoRoutes.get("/sitemap.xml", async (c) => {
  const origin = siteOrigin(c);
  const lastmod = await loadLastModified(c.get("db"));
  const urls: Array<{ loc: string; lastmod: string; priority: string }> = [
    { loc: `${origin}/`, lastmod: lastmod.home, priority: "1.0" },
    { loc: `${origin}/tours`, lastmod: lastmod.toursIndex, priority: "0.9" },
    ...[...lastmod.tours].map(([slug, mod]) => ({ loc: `${origin}/tours/${slug}`, lastmod: mod, priority: "0.8" })),
    { loc: `${origin}/contact`, lastmod: lastmod.settings, priority: "0.5" },
    { loc: `${origin}/privacy`, lastmod: LEGAL_LAST_UPDATED, priority: "0.2" },
    { loc: `${origin}/terms`, lastmod: LEGAL_LAST_UPDATED, priority: "0.2" },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${escapeHtml(u.lastmod)}</lastmod><priority>${u.priority}</priority></url>`)
    .join("\n")}\n</urlset>\n`;
  return c.body(xml, 200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
});

seoRoutes.get("/robots.txt", (c) => {
  const origin = siteOrigin(c);
  return c.text(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /booking/\nDisallow: /account\nDisallow: /reset-password\n\nSitemap: ${origin}/sitemap.xml\n`,
    200,
    { "cache-control": "public, max-age=86400" },
  );
});
