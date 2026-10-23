import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { requireAdmin } from "../../middleware/auth";
import { sameOriginOnly } from "../../middleware/security";
import { adminAuthRoutes } from "./auth";
import { adminSetupRoutes } from "./setup";
import { adminDashboardRoutes } from "./dashboard";
import { adminTourRoutes } from "./tours";
import { adminBookingRoutes } from "./bookings";
import { adminPaymentRoutes } from "./payments";
import { adminContentRoutes } from "./content";
import { adminUserRoutes } from "./users";
import { adminAuditRoutes } from "./audit";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", sameOriginOnly);
// Login/logout are public; /auth/me and /auth/password authenticate themselves.
adminRoutes.route("/", adminAuthRoutes);
adminRoutes.route("/", adminSetupRoutes);

const protectedRoutes = new Hono<AppEnv>();
protectedRoutes.use("*", requireAdmin);
protectedRoutes.route("/", adminDashboardRoutes);
protectedRoutes.route("/", adminTourRoutes);
protectedRoutes.route("/", adminBookingRoutes);
protectedRoutes.route("/", adminPaymentRoutes);
protectedRoutes.route("/", adminContentRoutes);
protectedRoutes.route("/", adminUserRoutes);
protectedRoutes.route("/", adminAuditRoutes);
adminRoutes.route("/", protectedRoutes);
