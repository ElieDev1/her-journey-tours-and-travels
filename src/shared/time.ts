import { BUSINESS_UTC_OFFSET } from "./constants";

export const nowIso = () => new Date().toISOString();

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Today's date (YYYY-MM-DD) in the business timezone. */
export function businessToday(now = new Date()): string {
  return new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
}

/** Convert a local business date + time to a UTC ISO timestamp. */
export function businessDateTimeToIso(date: string, time: string | null): string {
  return new Date(`${date}T${time ?? "00:00"}:00${BUSINESS_UTC_OFFSET}`).toISOString();
}

/** Convert a local business datetime ("YYYY-MM-DDTHH:MM") to UTC ISO. */
export function businessLocalToIso(local: string): string {
  return new Date(`${local}:00${BUSINESS_UTC_OFFSET}`).toISOString();
}

/** Convert a UTC ISO timestamp to a business-local "YYYY-MM-DDTHH:MM". */
export function isoToBusinessLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + 2 * 3_600_000).toISOString().slice(0, 16);
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kigali",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kigali",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kigali",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Format a YYYY-MM-DD business date, e.g. "Sun, 15 Nov 2026". */
export function formatDate(ymd: string, long = false): string {
  const d = new Date(`${ymd}T12:00:00${BUSINESS_UTC_OFFSET}`);
  return (long ? longDateFormatter : dateFormatter).format(d);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** "07:00" -> "7:00 AM" */
export function formatTime(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Day, short month and weekday of a YYYY-MM-DD date, for calendar-style badges. */
export function dateParts(ymd: string): { day: string; month: string; weekday: string } {
  const [weekday = "", day = "", month = ""] = formatDate(ymd).replace(",", "").split(" ");
  return { day, month, weekday };
}
