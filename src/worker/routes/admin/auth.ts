import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../../env";
import { adminUsers } from "../../db/schema";
import { requireAdmin } from "../../middleware/auth";
import { HttpError, clientIp, parseJson } from "../../lib/http";
import { changePasswordSchema, loginSchema } from "../../../shared/schemas";
import { ROLE_PERMISSIONS } from "../../../shared/constants";
import { hashPassword, verifyPassword } from "../../lib/crypto";
import { audit } from "../../services/audit";
import { enforceRateLimit } from "../../services/rateLimit";
import { adminToDTO, login, logout, revokeUserSessions } from "../../services/auth";
import type { SessionDTO } from "../../../shared/types";

export const adminAuthRoutes = new Hono<AppEnv>();

adminAuthRoutes.post("/auth/login", async (c) => {
  const db = c.get("db");
  const ip = clientIp(c);
  await enforceRateLimit(db, `login:${ip}`, 10, 900);
  const { email, password } = await parseJson(c, loginSchema);
  await enforceRateLimit(db, `login-email:${email}`, 20, 3600);
  const user = await login(c, db, email, password);
  await audit(db, { adminId: user.id, action: "auth.login", entityType: "admin_user", entityId: user.id, ip });
  const body: SessionDTO = { user: adminToDTO(user), permissions: [...ROLE_PERMISSIONS[user.role]] };
  return c.json(body);
});

adminAuthRoutes.post("/auth/logout", async (c) => {
  await logout(c, c.get("db"));
  return c.json({ ok: true });
});

adminAuthRoutes.get("/auth/me", requireAdmin, async (c) => {
  const admin = c.get("admin");
  const user = await c.get("db").select().from(adminUsers).where(eq(adminUsers.id, admin.id)).get();
  if (!user) throw new HttpError(401, "Please sign in to continue");
  const body: SessionDTO = { user: adminToDTO(user), permissions: [...ROLE_PERMISSIONS[user.role]] };
  return c.json(body);
});

adminAuthRoutes.post("/auth/password", requireAdmin, async (c) => {
  const db = c.get("db");
  const admin = c.get("admin");
  await enforceRateLimit(db, `password:${admin.id}`, 5, 900);
  const input = await parseJson(c, changePasswordSchema);
  const user = await db.select().from(adminUsers).where(eq(adminUsers.id, admin.id)).get();
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Your current password is incorrect", { currentPassword: "Incorrect password" });
  }
  await db.update(adminUsers).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(adminUsers.id, admin.id));
  await revokeUserSessions(db, admin.id, admin.sessionId);
  await audit(db, { adminId: admin.id, action: "auth.password_change", entityType: "admin_user", entityId: admin.id, ip: clientIp(c) });
  return c.json({ ok: true });
});
