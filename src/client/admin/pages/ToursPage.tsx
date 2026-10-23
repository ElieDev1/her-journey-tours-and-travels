import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Map, Plus, Search, Star, TrendingUp } from "lucide-react";
import type { AdminTourRowDTO } from "@shared/types";
import { TOUR_STATUSES, TOUR_STATUS_LABELS } from "@shared/constants";
import { formatMoney } from "@shared/money";
import { formatDate } from "@shared/time";
import { api, errorMessage, queryString } from "@client/lib/api";
import { ButtonLink } from "@client/components/ui/Button";
import { Input, Select } from "@client/components/ui/Field";
import { TourStatusBadge } from "@client/components/ui/Badge";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Td, Th } from "../components/PageHeader";
import { useCan } from "../session";

export function ToursPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "";
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "tours", { q: params.get("q"), status }],
    queryFn: () => api.get<{ items: AdminTourRowDTO[] }>(`/api/admin/tours${queryString({ q: params.get("q"), status })}`),
  });
  const toggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/admin/tours/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tours"] });
      toast("Tour updated");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  return (
    <>
      <PageHeader
        title="Tours"
        description="Create and manage tours, schedules, pricing and media."
        actions={can("tours:write") && <ButtonLink to="/admin/tours/new" icon={<Plus className="size-4" />}>New tour</ButtonLink>}
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <form
          className="relative min-w-60 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const next = new URLSearchParams(params);
            if (q.trim()) next.set("q", q.trim());
            else next.delete("q");
            setParams(next);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <Input aria-label="Search tours" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or destination" className="pl-10" />
        </form>
        <Select
          aria-label="Filter by status"
          className="w-48"
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("status", e.target.value);
            else next.delete("status");
            setParams(next);
          }}
        >
          <option value="">All statuses</option>
          {TOUR_STATUSES.map((s) => <option key={s} value={s}>{TOUR_STATUS_LABELS[s]}</option>)}
        </Select>
      </div>

      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<Map className="size-6" />} title="No tours found" action={can("tours:write") && <ButtonLink to="/admin/tours/new">Create a tour</ButtonLink>}>
          Tours you create appear here.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-line/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-ivory">
                <tr><Th>Tour</Th><Th>Status</Th><Th>Next departure</Th><Th>Price</Th><Th>Bookings</Th><Th>Flags</Th><Th className="text-right">Actions</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.items.map((t) => (
                  <tr key={t.id} className="hover:bg-ivory">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-sand">
                          {t.coverUrl && <img src={t.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
                        </div>
                        <div className="min-w-0">
                          <Link to={`/admin/tours/${t.id}`} className="font-semibold text-forest-900 hover:underline">{t.title}</Link>
                          <p className="truncate text-xs text-muted">{t.destination}{t.categoryName ? ` · ${t.categoryName}` : ""}</p>
                        </div>
                      </div>
                    </Td>
                    <Td><TourStatusBadge status={t.status} /></Td>
                    <Td>{t.nextDepartureDate ? formatDate(t.nextDepartureDate) : <span className="text-muted">None</span>}<p className="text-xs text-muted">{t.departureCount} date{t.departureCount === 1 ? "" : "s"} total</p></Td>
                    <Td className="whitespace-nowrap">{formatMoney(t.adultPrice, t.currency)}</Td>
                    <Td><Link to={`/admin/bookings?tourId=${t.id}`} className="font-semibold text-forest-700 hover:underline">{t.bookingCount}</Link></Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          disabled={!can("tours:write")}
                          onClick={() => toggle.mutate({ id: t.id, body: { isFeatured: !t.isFeatured } })}
                          className={`rounded-lg p-1.5 ${t.isFeatured ? "bg-sun-100 text-sun-700" : "text-stone-400 hover:bg-sand"}`}
                          title={t.isFeatured ? "Featured (click to remove)" : "Mark as featured"}
                          aria-pressed={t.isFeatured}
                        >
                          <Star className={`size-4 ${t.isFeatured ? "fill-current" : ""}`} />
                        </button>
                        <button
                          disabled={!can("tours:write")}
                          onClick={() => toggle.mutate({ id: t.id, body: { isPopular: !t.isPopular } })}
                          className={`rounded-lg p-1.5 ${t.isPopular ? "bg-forest-50 text-forest-700" : "text-stone-400 hover:bg-sand"}`}
                          title={t.isPopular ? "Popular (click to remove)" : "Mark as popular"}
                          aria-pressed={t.isPopular}
                        >
                          <TrendingUp className="size-4" />
                        </button>
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {can("tours:write") && (
                          <select
                            aria-label="Change status"
                            value={t.status}
                            onChange={(e) => toggle.mutate({ id: t.id, body: { status: e.target.value } })}
                            className="rounded-lg border border-line bg-white px-2 py-1 text-xs"
                          >
                            {TOUR_STATUSES.map((s) => <option key={s} value={s}>{TOUR_STATUS_LABELS[s]}</option>)}
                          </select>
                        )}
                        {t.status === "published" && (
                          <a href={`/tours/${t.slug}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-sand" title="View on website">
                            <ExternalLink className="size-4" />
                          </a>
                        )}
                        {can("tours:write") && (
                          <Link to={`/admin/tours/new?from=${t.id}`} className="rounded-lg p-1.5 text-muted hover:bg-sand" title="Duplicate as new tour">
                            <Copy className="size-4" />
                          </Link>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
