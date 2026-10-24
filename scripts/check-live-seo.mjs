#!/usr/bin/env node
// Checks the live site's search-engine essentials. Usage:
//   node scripts/check-live-seo.mjs https://herjourney.rw
// Exits non-zero if any check fails.
const origin = (process.argv[2] ?? "https://herjourney.rw").replace(/\/$/, "");
const wwwOrigin = origin.replace("://", "://www.");
const VERIFY_PATH = "/googleb9325a9dbac8e007.html";
const VERIFY_BODY = "google-site-verification: googleb9325a9dbac8e007.html";
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
};
const get = (url, opts = {}) => fetch(url, { redirect: "manual", headers: { "user-agent": "her-journey-seo-check" }, ...opts });

function crawlable(html) {
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/);
  const text = (root?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  return { text, ld, types: ld.map((d) => d["@type"]) };
}

// www hosts don't resolve for localhost runs, so only the apex is checked there.
const isLocal = new URL(origin).hostname === "localhost";

for (const base of isLocal ? [origin] : [origin, wwwOrigin]) {
  const res = await get(base + VERIFY_PATH);
  const body = await res.text();
  check(`verification file on ${base}`, res.status === 200 && body === VERIFY_BODY && (res.headers.get("content-type") ?? "").startsWith("text/html"),
    `${res.status} ${res.headers.get("content-type")} ${JSON.stringify(body.slice(0, 80))}`);
}

if (!isLocal) {
  const redirect = await get(`${wwwOrigin}/tours?ref=check`);
  check("www redirects to apex (301, same path)", redirect.status === 301 && redirect.headers.get("location") === `${origin}/tours?ref=check`,
    `${redirect.status} ${redirect.headers.get("location")}`);
}

for (const [path, minChars, mustHave] of [
  ["/", 800, ["TravelAgency"]],
  ["/tours", 300, ["TravelAgency", "ItemList", "BreadcrumbList"]],
]) {
  const res = await get(origin + path, { headers: { accept: "text/html" } });
  const { text, ld, types } = crawlable(await res.text());
  check(`${path} server-rendered text`, res.status === 200 && text.length >= minChars, `${res.status}, ${text.length} chars`);
  check(`${path} JSON-LD ${mustHave.join("+")}`, mustHave.every((t) => types.includes(t)), types.join(", "));
  const org = ld.find((d) => d["@type"] === "TravelAgency");
  if (path === "/" && org) console.log("      organization:", JSON.stringify({ url: org.url, telephone: org.telephone, email: org.email, address: org.address, sameAs: org.sameAs }));
  if (path === "/") console.log("      text sample:", text.slice(0, 300));
}

const sitemapRes = await get(`${origin}/sitemap.xml`);
const sitemap = await sitemapRes.text();
const locs = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)];
const urlCount = (sitemap.match(/<url>/g) ?? []).length;
check("sitemap: every URL has lastmod", sitemapRes.status === 200 && urlCount > 0 && locs.length === urlCount, `${locs.length}/${urlCount}`);

const tourPath = locs.map((m) => new URL(m[1]).pathname).find((p) => p.startsWith("/tours/"));
if (tourPath) {
  const res = await get(origin + tourPath, { headers: { accept: "text/html" } });
  const { text, types } = crawlable(await res.text());
  check(`${tourPath} content + JSON-LD`, res.status === 200 && text.length > 200 && ["TravelAgency", "TouristTrip", "BreadcrumbList"].every((t) => types.includes(t)),
    `${text.length} chars; ${types.join(", ")}`);
}

const robots = await (await get(`${origin}/robots.txt`)).text();
check("robots.txt points to sitemap", robots.includes(`Sitemap: ${origin}/sitemap.xml`));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
