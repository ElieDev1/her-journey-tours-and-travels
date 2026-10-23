import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { siteSettings } from "../db/schema";
import type { PublicSettingsDTO } from "../../shared/types";
import { mediaUrl } from "./media";

export type SettingsMap = Record<string, unknown>;

export async function loadSettings(db: Database): Promise<SettingsMap> {
  const rows = await db.select().from(siteSettings);
  const map: SettingsMap = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = null;
    }
  }
  return map;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export const DEFAULT_HOLD_MINUTES = 120;

export function toPublicSettings(s: SettingsMap): PublicSettingsDTO {
  const heroKey = str(s.hero_image_key);
  return {
    companyName: str(s.company_name) ?? "Her Journey Tours and Travels",
    tagline: str(s.tagline),
    phonePrimary: str(s.phone_primary),
    phoneSecondary: str(s.phone_secondary),
    whatsappNumber: str(s.whatsapp_number),
    contactEmail: str(s.contact_email),
    address: str(s.address),
    momoPayCode: str(s.momo_pay_code) ?? "",
    momoMerchantName: str(s.momo_merchant_name) ?? "Her Journey Tours and Travels",
    bookingHoldMinutes: num(s.booking_hold_minutes, DEFAULT_HOLD_MINUTES),
    heroTitle: str(s.hero_title) ?? "Discover Rwanda",
    heroSubtitle: str(s.hero_subtitle),
    heroImageUrl: heroKey ? mediaUrl(heroKey) : null,
    aboutText: str(s.about_text),
    social: {
      instagram: str(s.social_instagram),
      facebook: str(s.social_facebook),
      tiktok: str(s.social_tiktok),
    },
  };
}

export async function saveSettings(db: Database, values: SettingsMap, adminId: number): Promise<void> {
  const statements = Object.entries(values).map(([key, value]) =>
    db
      .insert(siteSettings)
      .values({ key, value: JSON.stringify(value ?? null), updatedBy: adminId })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: sql`excluded.value`, updatedBy: adminId, updatedAt: new Date().toISOString() },
      }),
  );
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}

export async function getSetting(db: Database, key: string): Promise<unknown> {
  const row = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).get();
  return row ? JSON.parse(row.value) : null;
}
