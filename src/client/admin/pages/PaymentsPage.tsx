import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Wallet } from "lucide-react";
import type { AdminPaymentRowDTO, Paginated } from "@shared/types";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@shared/constants";
import { formatMoney } from "@shared/money";
import { formatDate, formatDateTime } from "@shared/time";
import { api, errorMessage, queryString } from "@client/lib/api";
import { Input, Select } from "@client/components/ui/Field";
import { BookingStatusBadge, PaymentStatusBadge } from "@client/components/ui/Badge";
import { Pagination } from "@client/components/ui/Pagination";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { PageHeader, Td, Th } from "../components/PageHeader";
import { PaymentActions } from "../components/PaymentActions";
import { StatCard } from "../components/StatCard";

interface Summary {
  revenue: Array<{ currency: string; amount: number }>;
  refunds: Array<{ currency: string; amount: number }>;
  statusCounts: Array<{ status: PaymentStatus; n: number }>;
}

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "";
  const page = params.get("page") ?? "1";
  const summary = useQuery({ queryKey: ["admin", "payments", "summary"], queryFn: () => api.get<Summary>("/api/admin/payments/summary") });
  const list = useQuery({
    queryKey: ["admin", "payments", { q: params.get("q"), status, page }],
    queryFn: () => api.get<Paginated<AdminPaymentRowDTO>>(`/api/admin/payments${queryString({ q: params.get("q"), status, page, pageSize: 25 })}`),
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
  const count = (s: PaymentStatus) => summary.data?.statusCounts.find((c) => c.status === s)?.n ?? 0;

  return (
    <>
      <PageHeader title="Payments" description="Verify MoMo payments submitted by customers, reject invalid ones and record refunds." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting verification" value={count("submitted")} icon={<Wallet className="size-5" />} tone="sun" />
        <StatCard
          label="Verified revenue"
          value={summary.data?.revenue.length ? summary.data.revenue.map((r) => formatMoney(r.amount, r.currency)).join(" · ") : "0"}
          icon={<Wallet className="size-5" />}
        />
        <StatCard
          label="Refunded"
          value={summary.data?.refunds.length ? summary.data.refunds.map((r) => formatMoney(r.amount, r.currency)).join(" · ") : "0"}
          icon={<Wallet className="size-5" />}
          tone="sage"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <form className="relative min-w-64 flex-1" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search payments" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Transaction ID, booking reference, name or phone" className="pl-10" />
        </form>
        <Select aria-label="Status" className="w-52" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">All (excluding unpaid)</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}{s === "pending" ? " (unpaid)" : ""}</option>)}
        </Select>
      </div>

      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<Wallet className="size-6" />} title="No payments found">Submitted MoMo payments will appear here for verification.</EmptyState>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-ivory"><tr><Th>Transaction</Th><Th>Booking</Th><Th>Amount</Th><Th>Paid</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((p) => (
                    <tr key={p.id} className={p.status === "submitted" ? "bg-info-50/40" : ""}>
                      <Td>
                        <p className="font-mono font-semibold">{p.transactionReference ?? "—"}</p>
                        <p className="text-xs text-muted">{PAYMENT_METHOD_LABELS[p.method]} · {p.payerPhone ?? "no phone"}</p>
                      </Td>
                      <Td>
                        <Link to={`/admin/bookings/${p.bookingId}`} className="font-mono font-semibold text-forest-700 hover:underline">{p.bookingReference}</Link>
                        <p className="text-xs text-muted">{p.customerName} · {p.tourTitle} · {formatDate(p.departureDate)}</p>
                        <div className="mt-1"><BookingStatusBadge status={p.bookingStatus} /></div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <p className="font-semibold">{formatMoney(p.amount, p.currency)}</p>
                        <p className={`text-xs ${p.amount < p.bookingTotal ? "text-sun-700" : "text-muted"}`}>of {formatMoney(p.bookingTotal, p.currency)}</p>
                      </Td>
                      <Td>
                        <p>{p.paidAt ?? "—"}</p>
                        {p.submittedAt && <p className="text-xs text-muted">Submitted {formatDateTime(p.submittedAt)}</p>}
                        {p.reviewedAt && <p className="text-xs text-muted">Reviewed {formatDateTime(p.reviewedAt)}{p.reviewedByName ? ` by ${p.reviewedByName}` : ""}</p>}
                      </Td>
                      <Td>
                        <PaymentStatusBadge status={p.status} />
                        {p.rejectionReason && <p className="mt-1 max-w-48 text-xs text-danger-600">{p.rejectionReason}</p>}
                      </Td>
                      <Td><PaymentActions payment={p} bookingTotal={p.bookingTotal} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={(pg) => update({ page: String(pg) })} />
          </div>
        </>
      )}
    </>
  );
}
