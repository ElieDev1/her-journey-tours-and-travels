import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { rateLimits } from "../db/schema";
import { HttpError } from "../lib/http";

/**
 * Fixed-window rate limiter backed by D1. Atomic: the increment and the read
 * happen in one upsert statement.
 */
export async function enforceRateLimit(
  db: Database,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const row = await db
    .insert(rateLimits)
    .values({ bucket, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })
    .get();
  if (row && row.count > limit) {
    throw new HttpError(429, "Too many requests. Please wait a moment and try again.");
  }
}

export async function pruneRateLimits(db: Database): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600;
  await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < ${cutoff}`);
}
