import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Search, UserRound } from "lucide-react";
import type { AdminCustomerRowDTO, Paginated } from "@shared/types";
import { formatDateTime } from "@shared/time";
import { api, errorMessage, queryString } from "@client/lib/api";
import { Input, Select } from "@client/components/ui/Field";
import { Pagination } from "@client/components/ui/Pagination";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { buttonClasses } from "@client/components/ui/Button";
import { PageHeader, Td, Th } from "../components/PageHeader";
import { AccountStatus, SignInMethods } from "../components/SignInMethods";
import { useCan } from "../session";

/** Traveller accounts registered on the website. */
export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const can = useCan();
  const filters = { q: params.get("q") ?? "", status: params.get("status") ?? "", method: params.get("method") ?? "", page: params.get("page") ?? "1" };
  const list = useQuery({
    queryKey: ["admin", "customers", filters],
    queryFn: () => api.get<Paginated<AdminCustomerRowDTO>>(`/api/admin/customers${queryString({ ...filters, pageSize: 25 })}`),
    placeholderData: keepPreviousData,
  });
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Travellers who have created an account on the website."
        actions={
          can("customers:manage") && (
            <a href={`/api/admin/customers/export.csv${queryString({ ...filters, page: undefined })}`} className={buttonClasses("secondary", "sm")}>
              <Download className="size-4" /> Export CSV
            </a>
          )
        }
      />
      <div className="mb-5 grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70 md:grid-cols-[2fr_1fr_1fr]">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== filters.q && update({ q: q.trim() })} placeholder="Search by name, email or phone" className="pl-10" />
        </form>
        <Select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </Select>
        <Select aria-label="Sign-in method" value={filters.method} onChange={(e) => update({ method: e.target.value })}>
          <option value="">Any sign-in method</option>
          <option value="password">Email &amp; password</option>
          <option value="google">Google</option>
        </Select>
      </div>

      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<UserRound className="size-6" />} title="No users found">Travellers appear here once they create an account.</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-ivory"><tr><Th>User</Th><Th>Phone</Th><Th>Sign-in</Th><Th>Bookings</Th><Th>Last sign-in</Th><Th>Joined</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((u) => (
                    <tr key={u.id} className="hover:bg-ivory">
                      <Td>
                        <Link to={`/admin/users/${u.id}`} className="font-semibold text-forest-800 hover:underline">{u.fullName}</Link>
                        <p className="text-xs text-muted">{u.email}</p>
                      </Td>
                      <Td>{u.phone ?? <span className="text-muted">—</span>}</Td>
                      <Td><SignInMethods hasPassword={u.hasPassword} hasGoogle={u.hasGoogle} /></Td>
                      <Td>{u.bookingCount}</Td>
                      <Td className="whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted">Never</span>}</Td>
                      <Td className="whitespace-nowrap">{formatDateTime(u.createdAt)}</Td>
                      <Td><AccountStatus disabledAt={u.disabledAt} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted">{list.data.total} user{list.data.total === 1 ? "" : "s"}</p>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={(p) => update({ page: String(p) })} />
          </div>
        </>
      )}
    </>
  );
}
