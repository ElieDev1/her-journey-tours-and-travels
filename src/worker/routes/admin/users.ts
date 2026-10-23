import { Hono } from "hono";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { AppEnv } from "../../env";
import { adminUsers } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { HttpError, clientIp, notFound, parseId, parseJson } from "../../lib/http";
import { adminUserCreateSchema, adminUserUpdateSchema } from "../../../shared/schemas";
import { hashPassword } from "../../lib/crypto";
import { audit } from "../../services/audit";
import { adminToDTO, revokeUserSessions } from "../../services/auth";

export const adminUserRoutes = new Hono<AppEnv>();
adminUserRoutes.use("/users/*", requirePermission("users:manage"));
adminUserRoutes.use("/users", requirePermission("users:manage"));

adminUserRoutes.get("/users", async (c) => {
  const rows = await c.get("db").select().from(adminUsers).orderBy(asc(adminUsers.name));
  return c.json({ items: rows.map(adminToDTO) });
});

adminUserRoutes.post("/users", async (c) => {
  const db = c.get("db");
  const input = await parseJson(c, adminUserCreateSchema);
  const exists = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, input.email)).get();
  if (exists) throw new HttpError(409, "An administrator with this email already exists", { email: "Already registered" });
  const row = await db
    .insert(adminUsers)
    .values({ email: input.email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password) })
    .returning()
    .get();
  await audit(db, { adminId: c.get("admin").id, action: "user.create", entityType: "admin_user", entityId: row.id, details: { email: row.email, role: row.role }, ip: clientIp(c) });
  return c.json(adminToDTO(row), 201);
});

adminUserRoutes.patch("/users/:id", async (c) => {
  const db = c.get("db");
  const me = c.get("admin");
  const id = parseId(c.req.param("id"), "Administrator");
  const input = await parseJson(c, adminUserUpdateSchema);
  const target = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).get();
  if (!target) throw notFound("Administrator");

  if (id === me.id && (input.isActive === false || (input.role && input.role !== "owner"))) {
    throw new HttpError(400, "You cannot deactivate or demote your own account.");
  }
  // Never leave the system without an active owner.
  if (target.role === "owner" && (input.isActive === false || (input.role && input.role !== "owner"))) {
    const others = await db
      .select({ n: sql<number>`count(*)` })
      .from(adminUsers)
      .where(and(eq(adminUsers.role, "owner"), eq(adminUsers.isActive, true), ne(adminUsers.id, id)))
      .get();
    if (!others?.n) throw new HttpError(400, "At least one active owner is required.");
  }

  const row = await db
    .update(adminUsers)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password), failedLoginCount: 0, lockedUntil: null } : {}),
    })
    .where(eq(adminUsers.id, id))
    .returning()
    .get();
  if (input.isActive === false || input.password || input.role) await revokeUserSessions(db, id);
  await audit(db, {
    adminId: me.id,
    action: "user.update",
    entityType: "admin_user",
    entityId: id,
    details: { role: input.role, isActive: input.isActive, passwordReset: Boolean(input.password) },
    ip: clientIp(c),
  });
  return c.json(adminToDTO(row!));
});
