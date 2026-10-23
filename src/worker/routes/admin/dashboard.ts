import { Hono } from "hono";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "../../env";
import { bookings, payments, tourDepartures, tours } from "../../db/schema";
import type { DashboardDTO } from "../../../shared/types";
import { businessToday } from "../../../shared/time";
import { departureToDTO } from "../../services/tours";
import { expireStaleBookings } from "../../services/bookings";
import { listBookingRows } from "./bookings";

export const adminDashboardRoutes = new Hono<AppEnv>();

adminDashboardRoutes.get("/dashboard", async (c) => {
  const db = c.get("db");
  await expireStaleBookings(db, c.env.DB);
  const today = businessToday();
  const count = sql<number>`count(*)`;

  const [tourCounts, upcomingCount, bookingCounts, pendingPayments, revenue, recentBookings, upcoming] = await Promise.all([
    db.select({ status: tours.status, n: count }).from(tours).groupBy(tours.status),
    db
      .select({ n: count })
      .from(tourDepartures)
      .where(and(eq(tourDepartures.status, "scheduled"), gte(tourDepartures.startDate, today)))
      .get(),
    db.select({ status: bookings.status, n: count }).from(bookings).groupBy(bookings.status),
    db.select({ n: count }).from(payments).where(eq(payments.status, "submitted")).get(),
    db
      .select({ currency: payments.currency, amount: sql<number>`SUM(${payments.amount})` })
      .from(payments)
      .where(eq(payments.status, "verified"))
      .groupBy(payments.currency),
    listBookingRows(db, undefined, 8, 0),
    db
      .select({ departure: tourDepartures, tour: tours })
      .from(tourDepartures)
      .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
      .where(and(inArray(tourDepartures.status, ["scheduled", "closed"]), gte(tourDepartures.startDate, today)))
      .orderBy(asc(tourDepartures.startDate))
      .limit(6),
  ]);

  const departureIds = upcoming.map((u) => u.departure.id);
  const guestRows = departureIds.length
    ? await db
        .select({
          departureId: bookings.departureId,
          confirmed: sql<number>`SUM(CASE WHEN ${bookings.status} = 'confirmed' THEN ${bookings.totalGuests} ELSE 0 END)`,
          held: sql<number>`SUM(CASE WHEN ${bookings.seatsHeld} = 1 THEN ${bookings.totalGuests} ELSE 0 END)`,
        })
        .from(bookings)
        .where(inArray(bookings.departureId, departureIds))
        .groupBy(bookings.departureId)
    : [];

  const sum = (rows: Array<{ n: number }>) => rows.reduce((s, r) => s + r.n, 0);
  const body: DashboardDTO = {
    totals: {
      tours: sum(tourCounts.filter((t) => t.status !== "archived")),
      publishedTours: tourCounts.find((t) => t.status === "published")?.n ?? 0,
      upcomingDepartures: upcomingCount?.n ?? 0,
      bookings: sum(bookingCounts),
      pendingPayments: pendingPayments?.n ?? 0,
      confirmedBookings: bookingCounts.find((b) => b.status === "confirmed")?.n ?? 0,
    },
    revenue: revenue.map((r) => ({ currency: r.currency, amount: r.amount })),
    recentBookings,
    upcomingTrips: upcoming.map((u) => {
      const g = guestRows.find((r) => r.departureId === u.departure.id);
      return {
        departure: departureToDTO(u.departure, u.tour),
        tourTitle: u.tour.title,
        tourId: u.tour.id,
        confirmedGuests: g?.confirmed ?? 0,
        heldGuests: g?.held ?? 0,
      };
    }),
  };
  return c.json(body);
});
