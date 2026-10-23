import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../../env";
import type { Database } from "../../db/client";
import { adminUsers } from "../../db/schema";
import { HttpError, clientIp, parseJson } from "../../lib/http";
import { adminSetupSchema } from "../../../shared/schemas";
import { ROLE_PERMISSIONS } from "../../../shared/constants";
import { hashPassword, safeEqual, sha256Hex } from "../../lib/crypto";
import { audit } from "../../services/audit";
import { enforceRateLimit } from "../../services/rateLimit";
import { adminToDTO, login } from "../../services/auth";
import type { SessionDTO } from "../../../shared/types";

/**
 * First-run setup: lets the site owner create the first administrator from
 * the browser. It only works while no administrator exists, and requires the
 * ADMIN_SETUP_TOKEN secret so a stranger cannot claim a fresh deployment.
 */
export const adminSetupRoutes = new Hono<AppEnv>();

async function adminCount(db: Database): Promise<number> {
  const row = await db.select({ n: sql<number>`count(*)` }).from(adminUsers).get();
  return row?.n ?? 0;
}

adminSetupRoutes.get("/setup/status", async (c) => {
  const needsSetup = (await adminCount(c.get("db"))) === 0;
  return c.json({ needsSetup, setupCodeConfigured: Boolean(c.env.ADMIN_SETUP_TOKEN) });
});

adminSetupRoutes.post("/setup", async (c) => {
  const db = c.get("db");
  await enforceRateLimit(db, `setup:${clientIp(c)}`, 10, 900);
  if ((await adminCount(db)) > 0) {
    throw new HttpError(409, "Setup is already complete. Sign in instead.");
  }
  const expected = c.env.ADMIN_SETUP_TOKEN;
  if (!expected) {
    throw new HttpError(503, "No setup code is configured. Add the ADMIN_SETUP_TOKEN secret and redeploy.");
  }
  const input = await parseJson(c, adminSetupSchema);
  // Compare digests so the check takes the same time whatever the input length.
  if (!safeEqual(await sha256Hex(input.setupToken), await sha256Hex(expected))) {
    throw new HttpError(403, "That setup code is not correct.", { setupToken: "Incorrect setup code" });
  }

  // Insert only if the table is still empty, so two simultaneous requests cannot both succeed.
  const result = await c.env.DB.prepare(
    `INSERT INTO admin_users (email, name, password_hash, role, is_active)
     SELECT ?, ?, ?, 'owner', 1 WHERE NOT EXISTS (SELECT 1 FROM admin_users)`,
  )
    .bind(input.email, input.name, await hashPassword(input.password))
    .run();
  if (result.meta.changes !== 1) throw new HttpError(409, "Setup is already complete. Sign in instead.");

  const user = await login(c, db, input.email, input.password);
  await audit(db, { adminId: user.id, action: "auth.setup_owner", entityType: "admin_user", entityId: user.id, ip: clientIp(c) });
  const body: SessionDTO = { user: adminToDTO(user), permissions: [...ROLE_PERMISSIONS[user.role]] };
  return c.json(body, 201);
});
