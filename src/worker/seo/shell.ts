import type { Context } from "hono";
import type { AppEnv } from "../env";

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON for a <script> element; "<" is escaped so content cannot close the tag. */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** Canonical origin (https://herjourney.rw in production). */
export function siteOrigin(c: Context<AppEnv>): string {
  return (c.env.PUBLIC_SITE_URL || new URL(c.req.url).origin).replace(/\/$/, "");
}

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "product";
  jsonLd?: unknown[];
  /** Crawlable markup placed inside #root; React replaces it when the app loads. */
  body: string;
  /** Private or utility pages that should not appear in search results. */
  noindex?: boolean;
}

/** Serve the SPA shell with page-specific metadata, JSON-LD and server-rendered content. */
export async function renderShell(c: Context<AppEnv>, meta: PageMeta, status = 200): Promise<Response> {
  const shell = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), { headers: { accept: "text/html" } }));
  if (!shell.ok) return shell;
  const origin = siteOrigin(c);
  const url = `${origin}${meta.path}`;
  const imagePath = meta.image ?? "/brand/logo-1200.png";
  const image = imagePath.startsWith("http") ? imagePath : `${origin}${imagePath}`;
  const setContent = (value: string) => ({
    element: (el: Element) => {
      el.setAttribute("content", value);
    },
  });

  const head = [
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    meta.noindex ? `<meta name="robots" content="noindex, follow" />` : "",
    ...(meta.jsonLd ?? []).map((d) => `<script type="application/ld+json">${safeJson(d)}</script>`),
  ].join("");

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
        el.append(head, { html: true });
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
  if (meta.noindex) headers.set("x-robots-tag", "noindex");
  headers.delete("content-length");
  return new Response(rewritten.body, { status, headers });
}
