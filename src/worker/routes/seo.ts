import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../env";
import { tours } from "../db/schema";
import { loadSettings, toPublicSettings } from "../services/settings";
import { loadTourDetail } from "../services/tours";
import { formatMoney, toMajor } from "../../shared/money";
import { formatDate, formatTime } from "../../shared/time";
import { effectiveUnitPrices } from "../../shared/pricing";
import type { PublicSettingsDTO, TourDetailDTO } from "../../shared/types";

export const seoRoutes = new Hono<AppEnv>();

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON for a <script> element; "<" is escaped so content cannot close the tag. */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function siteOrigin(c: Context<AppEnv>): string {
  return (c.env.PUBLIC_SITE_URL || new URL(c.req.url).origin).replace(/\/$/, "");
}

interface PageMeta {
  title: string;
  description: string;
  path: string;
  image: string;
  type?: "website" | "product";
  jsonLd: unknown[];
  /** Crawlable markup placed inside #root; React replaces it on load. */
  body: string;
}

async function renderShell(c: Context<AppEnv>, meta: PageMeta, status = 200): Promise<Response> {
  const shell = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), { headers: { accept: "text/html" } }));
  if (!shell.ok) return shell;
  const origin = siteOrigin(c);
  const url = `${origin}${meta.path}`;
  const image = meta.image.startsWith("http") ? meta.image : `${origin}${meta.image}`;
  const setContent = (value: string) => ({
    element: (el: Element) => {
      el.setAttribute("content", value);
    },
  });

  const rewritten = new HTMLRewriter()
    .on("title", {
      element: (el) => {
        el.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', setContent(meta.description))
    .on('meta[property="og:title"]', setContent(meta.title))
    .on('meta[property="og:description"]', setContent(meta.description))
    .on('meta[property="og:image"]', setContent(image))
    .on('meta[property="og:type"]', setContent(meta.type ?? "website"))
    .on("head", {
      element: (el) => {
        el.append(
          [
            `<link rel="canonical" href="${escapeHtml(url)}" />`,
            `<meta property="og:url" content="${escapeHtml(url)}" />`,
            `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
            `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
            `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
            ...meta.jsonLd.map((d) => `<script type="application/ld+json">${safeJson(d)}</script>`),
          ].join(""),
          { html: true },
        );
      },
    })
    .on("div#root", {
      element: (el) => {
        el.setInnerContent(meta.body, { html: true });
      },
    })
    .transform(shell);

  const headers = new Headers(rewritten.headers);
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.delete("content-length");
  return new Response(rewritten.body, { status, headers });
}

function organizationLd(settings: PublicSettingsDTO, origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: settings.companyName,
    url: origin,
    logo: `${origin}/brand/logo-512.png`,
    image: `${origin}/brand/logo-1200.png`,
    ...(settings.phonePrimary ? { telephone: settings.phonePrimary } : {}),
    ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
    address: { "@type": "PostalAddress", addressCountry: "RW", ...(settings.address ? { streetAddress: settings.address } : {}) },
  };
}

seoRoutes.get("/", async (c) => {
  const settings = toPublicSettings(await loadSettings(c.get("db")));
  const description = settings.heroSubtitle ?? "Discover and book guided tours across Rwanda.";
  return renderShell(c, {
    title: `${settings.companyName} | Guided Tours & Trips in Rwanda`,
    description,
    path: "/",
    image: settings.heroImageUrl ?? "/brand/logo-1200.png",
    jsonLd: [organizationLd(settings, siteOrigin(c))],
    body: `<main><h1>${escapeHtml(settings.heroTitle)}</h1><p>${escapeHtml(description)}</p><p><a href="/tours">Explore tours</a></p></main>`,
  });
});

seoRoutes.get("/tours", async (c) => {
  const settings = toPublicSettings(await loadSettings(c.get("db")));
  return renderShell(c, {
    title: `Explore Tours | ${settings.companyName}`,
    description: "Browse upcoming tours, weekend escapes and scheduled trips. Filter by destination, date and price, then book online.",
    path: "/tours",
    image: "/brand/logo-1200.png",
    jsonLd: [],
    body: `<main><h1>Explore tours</h1></main>`,
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
  const included = t.lists.included.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return [
    `<main><article>`,
    `<h1>${escapeHtml(t.title)}</h1>`,
    `<p>${escapeHtml(t.destination)}, ${escapeHtml(t.country)}</p>`,
    t.shortDescription ? `<p>${escapeHtml(t.shortDescription)}</p>` : "",
    `<p>From ${escapeHtml(price)} ${t.pricing.pricingBasis === "per_person" ? "per person" : "per group"}</p>`,
    dates ? `<h2>Departures</h2><ul>${dates}</ul>` : "",
    t.pickupLocation ? `<p>Pickup: ${escapeHtml(t.pickupLocation)}</p>` : "",
    included ? `<h2>Included</h2><ul>${included}</ul>` : "",
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
  const settings = toPublicSettings(await loadSettings(db));
  if (!tour) {
    return renderShell(
      c,
      {
        title: `Tour not found | ${settings.companyName}`,
        description: "This tour is no longer available.",
        path: new URL(c.req.url).pathname,
        image: "/brand/logo-1200.png",
        jsonLd: [],
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
    {
      "@context": "https://schema.org",
      "@type": "TouristTrip",
      name: t.title,
      description: tourDescription(t),
      url: `${origin}/tours/${t.slug}`,
      ...(cover ? { image: cover.url.startsWith("http") ? cover.url : `${origin}${cover.url}` } : {}),
      touristType: t.category?.name,
      provider: { "@type": "TravelAgency", name: t.operatorName, url: origin },
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
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Tours", item: `${origin}/tours` },
        { "@type": "ListItem", position: 3, name: t.title, item: `${origin}/tours/${t.slug}` },
      ],
    },
  ];
  return renderShell(c, {
    title: t.seoTitle ?? `${t.title} | ${settings.companyName}`,
    description: tourDescription(t),
    path: `/tours/${t.slug}`,
    image: cover && !cover.url.endsWith(".svg") ? cover.url : "/brand/logo-1200.png",
    type: "product",
    jsonLd,
    body: tourBody(t, settings),
  });
});

// Registered after /tours/:slug. Sub-pages such as /tours/:slug/book are client-rendered and not indexed.
seoRoutes.get("/tours/:slug/:page{.+}", (c) =>
  c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), { headers: { accept: "text/html" } })),
);

seoRoutes.get("/sitemap.xml", async (c) => {
  const origin = siteOrigin(c);
  const rows = await c
    .get("db")
    .select({ slug: tours.slug, updatedAt: tours.updatedAt })
    .from(tours)
    .where(eq(tours.status, "published"));
  const urls = [
    { loc: `${origin}/`, priority: "1.0" },
    { loc: `${origin}/tours`, priority: "0.9" },
    { loc: `${origin}/contact`, priority: "0.5" },
    ...rows.map((r) => ({ loc: `${origin}/tours/${r.slug}`, lastmod: r.updatedAt.slice(0, 10), priority: "0.8" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${"lastmod" in u ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`)
    .join("\n")}\n</urlset>\n`;
  return c.body(xml, 200, { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
});

seoRoutes.get("/robots.txt", (c) => {
  const origin = siteOrigin(c);
  return c.text(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /booking/\n\nSitemap: ${origin}/sitemap.xml\n`,
    200,
    { "cache-control": "public, max-age=86400" },
  );
});
