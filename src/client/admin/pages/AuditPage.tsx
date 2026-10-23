import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditLogDTO, Paginated } from "@shared/types";
import { formatDateTime } from "@shared/time";
import { api, errorMessage, queryString } from "@client/lib/api";
import { Select } from "@client/components/ui/Field";
import { Pagination } from "@client/components/ui/Pagination";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { PageHeader, Td, Th } from "../components/PageHeader";

const ENTITY_TYPES = ["booking", "tour", "departure", "category", "review", "settings", "admin_user"];

function entityLink(log: AuditLogDTO) {
  if (!log.entityId) return log.entityType;
  if (log.entityType === "booking") return <Link className="text-forest-700 hover:underline" to={`/admin/bookings/${log.entityId}`}>booking #{log.entityId}</Link>;
  if (log.entityType === "tour") return <Link className="text-forest-700 hover:underline" to={`/admin/tours/${log.entityId}`}>tour #{log.entityId}</Link>;
  return `${log.entityType} #${log.entityId}`;
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const q = useQuery({
    queryKey: ["admin", "audit", page, entityType],
    queryFn: () => api.get<Paginated<AuditLogDTO>>(`/api/admin/audit-logs${queryString({ page, entityType })}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of administrative actions." />
      <Select aria-label="Filter by type" className="mb-5 w-56" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
        <option value="">All activity</option>
        {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
      </Select>
      {q.isPending ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-ivory"><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {q.data.items.map((l) => (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(l.createdAt)}<p className="text-xs text-muted">{l.ipAddress}</p></Td>
                      <Td>{l.adminName ?? <span className="text-muted">System</span>}</Td>
                      <Td className="font-mono text-xs">{l.action}</Td>
                      <Td>{entityLink(l)}</Td>
                      <Td><code className="block max-w-md truncate text-xs text-muted" title={JSON.stringify(l.details)}>{l.details ? JSON.stringify(l.details) : ""}</code></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-6 flex justify-end"><Pagination page={q.data.page} totalPages={q.data.totalPages} onChange={setPage} /></div>
        </>
      )}
    </>
  );
}
