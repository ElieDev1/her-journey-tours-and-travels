/** Turn a YouTube or Vimeo page URL into an embeddable player URL. */
export function videoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (u.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Google Maps embed (no API key needed) from coordinates or a place name. */
export function mapEmbedUrl(opts: { latitude: number | null; longitude: number | null; query: string }): string {
  const q = opts.latitude !== null && opts.longitude !== null ? `${opts.latitude},${opts.longitude}` : opts.query;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}

export function mapLinkUrl(opts: { mapUrl: string | null; latitude: number | null; longitude: number | null; query: string }): string {
  if (opts.mapUrl) return opts.mapUrl;
  const q = opts.latitude !== null && opts.longitude !== null ? `${opts.latitude},${opts.longitude}` : opts.query;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
