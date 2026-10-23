import { Hono } from "hono";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AppEnv } from "../../env";
import { adminUsers, auditLogs } from "../../db/schema";
import { requirePermission } from "../../middleware/auth";
import { paginate } from "../../lib/http";
import type { AuditLogDTO } from "../../../shared/types";

export function auditToDTO(log: typeof auditLogs.$inferSelect, adminName: string | null): AuditLogDTO {
  let details: unknown;
  try {
    details = log.details ? JSON.parse(log.details) : null;
  } catch {
    details = log.details;
  }
  return {
    id: log.id,
    adminName,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    details,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}

export const adminAuditRoutes = new Hono<AppEnv>();

adminAuditRoutes.get("/audit-logs", requirePermission("audit:read"), async (c) => {
  const db = c.get("db");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = 50;
  const entityType = c.req.query("entityType");
  const action = c.req.query("action")?.trim();
  const conds: SQL[] = [];
  if (entityType) conds.push(eq(auditLogs.entityType, entityType));
  if (action) conds.push(sql`${auditLogs.action} LIKE ${`${action.replace(/[%_]/g, "")}%`}`);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, count] = await Promise.all([
    db
      .select({ log: auditLogs, adminName: adminUsers.name })
      .from(auditLogs)
      .leftJoin(adminUsers, eq(auditLogs.adminId, adminUsers.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)` }).from(auditLogs).where(where).get(),
  ]);
  return c.json(paginate(rows.map((r) => auditToDTO(r.log, r.adminName)), count?.n ?? 0, page, pageSize));
});
