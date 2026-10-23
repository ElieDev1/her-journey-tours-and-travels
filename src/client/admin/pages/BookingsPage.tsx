import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarCheck, Download, Search } from "lucide-react";
import type { AdminBookingRowDTO, AdminTourRowDTO, Paginated } from "@shared/types";
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS } from "@shared/constants";
import { formatMoney } from "@shared/money";
import { formatDate, formatDateTime } from "@shared/time";
import { api, errorMessage, queryString } from "@client/lib/api";
import { Input, Select } from "@client/components/ui/Field";
import { BookingStatusBadge, PaymentStatusBadge } from "@client/components/ui/Badge";
import { Pagination } from "@client/components/ui/Pagination";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { buttonClasses } from "@client/components/ui/Button";
import { PageHeader, Td, Th } from "../components/PageHeader";

const KEYS = ["q", "status", "tourId", "departureId", "from", "to", "page"] as const;

export function BookingsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof KEYS)[number], string>;
  const tours = useQuery({ queryKey: ["admin", "tours", {}], queryFn: () => api.get<{ items: AdminTourRowDTO[] }>("/api/admin/tours") });
  const list = useQuery({
    queryKey: ["admin", "bookings", filters],
    queryFn: () => api.get<Paginated<AdminBookingRowDTO>>(`/api/admin/bookings${queryString({ ...filters, pageSize: 25 })}`),
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
  const exportUrl = `/api/admin/bookings/export.csv${queryString({ ...filters, page: undefined })}`;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every reservation, its guests and payment status."
        actions={<a href={exportUrl} className={buttonClasses("secondary", "sm")}><Download className="size-4" /> Export CSV</a>}
      />
      <div className="mb-5 grid gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-line/70 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1.5fr_1fr_1fr]">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search bookings" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== filters.q && update({ q: q.trim() })} placeholder="Reference, name, email or phone" className="pl-10" />
        </form>
        <Select aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>)}
        </Select>
        <Select aria-label="Tour" value={filters.tourId} onChange={(e) => update({ tourId: e.target.value, departureId: "" })}>
          <option value="">All tours</option>
          {tours.data?.items.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
        <Input aria-label="Departure from" type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} title="Departure from" />
        <Input aria-label="Departure to" type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} title="Departure to" />
      </div>
      {filters.departureId && (
        <p className="mb-4 text-sm text-muted">
          Showing one departure only. <button className="font-semibold text-forest-700 underline" onClick={() => update({ departureId: "" })}>Show all</button>
        </p>
      )}

      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<CalendarCheck className="size-6" />} title="No bookings found">Bookings appear here as soon as customers reserve a tour.</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-ivory"><tr><Th>Reference</Th><Th>Customer</Th><Th>Tour & date</Th><Th>Guests</Th><Th>Total</Th><Th>Payment</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((b) => (
                    <tr key={b.id} className="hover:bg-ivory">
                      <Td>
                        <Link to={`/admin/bookings/${b.id}`} className="font-mono font-semibold text-forest-700 hover:underline">{b.reference}</Link>
                        <p className="text-xs text-muted">{formatDateTime(b.createdAt)}</p>
                      </Td>
                      <Td><p className="font-medium">{b.customerName}</p><p className="text-xs text-muted">{b.customerPhone} · {b.customerEmail}</p></Td>
                      <Td><p className="max-w-56 truncate">{b.tourTitle}</p><p className="text-xs text-muted">{formatDate(b.departureDate)}</p></Td>
                      <Td>{b.totalGuests}<p className="text-xs text-muted">{b.adults}A {b.children ? `+ ${b.children}C` : ""}</p></Td>
                      <Td className="whitespace-nowrap">
                        {formatMoney(b.totalAmount, b.currency)}
                        {b.amountVerified > 0 && <p className="text-xs text-forest-700">{formatMoney(b.amountVerified, b.currency)} paid</p>}
                      </Td>
                      <Td>{b.latestPaymentStatus ? <PaymentStatusBadge status={b.latestPaymentStatus} /> : <span className="text-xs text-muted">—</span>}</Td>
                      <Td><BookingStatusBadge status={b.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted">{list.data.total} booking{list.data.total === 1 ? "" : "s"}</p>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={(p) => update({ page: String(p) })} />
          </div>
        </>
      )}
    </>
  );
}
