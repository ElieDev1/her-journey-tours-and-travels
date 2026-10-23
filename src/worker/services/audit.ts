import type { Database } from "../db/client";
import { auditLogs } from "../db/schema";

export interface AuditEntry {
  adminId: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: unknown;
  ip?: string | null;
}

export function auditInsert(db: Database, entry: AuditEntry) {
  return db.insert(auditLogs).values({
    adminId: entry.adminId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    details: entry.details === undefined ? null : JSON.stringify(entry.details),
    ipAddress: entry.ip ?? null,
  });
}

export async function audit(db: Database, entry: AuditEntry): Promise<void> {
  await auditInsert(db, entry);
}
