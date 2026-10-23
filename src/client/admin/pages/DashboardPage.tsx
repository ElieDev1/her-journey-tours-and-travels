import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, CheckCircle2, Map, Plus, Wallet, Eye, Hourglass } from "lucide-react";
import type { DashboardDTO } from "@shared/types";
import { formatMoney } from "@shared/money";
import { dateParts, formatDate, formatDateTime } from "@shared/time";
import { api } from "@client/lib/api";
import { ButtonLink } from "@client/components/ui/Button";
import { BookingStatusBadge, DepartureStatusBadge } from "@client/components/ui/Badge";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { PageHeader, Panel, Td, Th } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { useSession } from "../session";

export function DashboardPage() {
  const { data: session } = useSession();
  const q = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api.get<DashboardDTO>("/api/admin/dashboard") });
  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorState message="Could not load the dashboard." onRetry={() => q.refetch()} />;
  const d = q.data;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${session?.user.name.split(" ")[0] ?? ""}`}
        description="Here's what's happening with your tours and bookings."
        actions={<ButtonLink to="/admin/tours/new" icon={<Plus className="size-4" />}>New tour</ButtonLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total tours" value={d.totals.tours} icon={<Map className="size-5" />} to="/admin/tours" />
        <StatCard label="Published tours" value={d.totals.publishedTours} icon={<Eye className="size-5" />} to="/admin/tours?status=published" tone="sage" />
        <StatCard label="Upcoming departures" value={d.totals.upcomingDepartures} icon={<CalendarClock className="size-5" />} tone="info" />
        <StatCard label="Total bookings" value={d.totals.bookings} icon={<CalendarCheck className="size-5" />} to="/admin/bookings" />
        <StatCard label="Payments to verify" value={d.totals.pendingPayments} icon={<Hourglass className="size-5" />} to="/admin/payments?status=submitted" tone="sun" />
        <StatCard label="Confirmed bookings" value={d.totals.confirmedBookings} icon={<CheckCircle2 className="size-5" />} to="/admin/bookings?status=confirmed" tone="sage" />
        <div className="rounded-2xl bg-forest-700 p-5 text-white shadow-card sm:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-forest-100">Verified payment revenue</p>
            <span className="rounded-xl bg-white/10 p-2 text-sun-300"><Wallet className="size-5" /></span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1">
            {d.revenue.length ? (
              d.revenue.map((r) => <p key={r.currency} className="text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(r.amount, r.currency)}</p>)
            ) : (
              <p className="text-3xl font-semibold">0</p>
            )}
          </div>
          <p className="mt-1 text-xs text-forest-200">Sum of payments verified by your team (refunds excluded)</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel title="Recent bookings" actions={<Link to="/admin/bookings" className="text-sm font-semibold text-forest-700 hover:underline">View all</Link>} className="overflow-hidden [&>div:last-child]:p-0">
          {d.recentBookings.length === 0 ? (
            <p className="p-6 text-sm text-muted">No bookings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-ivory"><tr><Th>Reference</Th><Th>Customer</Th><Th>Departure</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.recentBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-ivory">
                      <Td className="whitespace-nowrap"><Link to={`/admin/bookings/${b.id}`} className="font-mono font-semibold text-forest-700 hover:underline">{b.reference}</Link></Td>
                      <Td><p className="font-medium">{b.customerName}</p><p className="text-xs whitespace-nowrap text-muted">{formatDateTime(b.createdAt)}</p></Td>
                      <Td><p className="max-w-48 truncate">{b.tourTitle}</p><p className="text-xs text-muted">{formatDate(b.departureDate)}</p></Td>
                      <Td className="whitespace-nowrap">{formatMoney(b.totalAmount, b.currency)}</Td>
                      <Td><BookingStatusBadge status={b.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Upcoming trips">
          {d.upcomingTrips.length === 0 ? (
            <p className="text-sm text-muted">No upcoming departures. Add dates from a tour's Schedule section.</p>
          ) : (
            <ul className="space-y-3">
              {d.upcomingTrips.map((t) => (
                <li key={t.departure.id}>
                  <Link to={`/admin/bookings?departureId=${t.departure.id}`} className="flex items-center gap-4 rounded-xl p-3 ring-1 ring-line hover:bg-ivory">
                    <div className="w-14 shrink-0 rounded-lg bg-forest-700 py-1.5 text-center text-white">
                      <p className="text-[0.65rem] text-sun-300 uppercase">{dateParts(t.departure.startDate).month}</p>
                      <p className="text-lg leading-none font-bold">{dateParts(t.departure.startDate).day}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-forest-950">{t.tourTitle}</p>
                      <p className="text-xs text-muted">
                        {t.confirmedGuests} confirmed · {t.heldGuests} seats held
                        {t.departure.seatCapacity !== null ? ` / ${t.departure.seatCapacity}` : " (no capacity set)"}
                      </p>
                    </div>
                    <DepartureStatusBadge status={t.departure.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
