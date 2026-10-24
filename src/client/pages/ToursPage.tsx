import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Compass, Search, SlidersHorizontal, X } from "lucide-react";
import type { Paginated, TourCardDTO, TourFiltersDTO } from "@shared/types";
import { api, queryString } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { TourCard } from "@client/components/site/TourCard";
import { Input, Select } from "@client/components/ui/Field";
import { Button } from "@client/components/ui/Button";
import { Pagination } from "@client/components/ui/Pagination";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { cn } from "@client/lib/cn";

const FILTER_KEYS = ["q", "category", "destination", "country", "from", "to", "minPrice", "maxPrice", "featured"] as const;

function FilterLabel({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold tracking-wide text-forest-900 uppercase">
      {children}
    </label>
  );
}

export function ToursPage() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");
  useDocumentMeta("Explore Tours | Her Journey Tours and Travels", "Browse upcoming tours, weekend escapes and scheduled trips across Rwanda.");

  const current = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof FILTER_KEYS)[number], string>;
  const sort = params.get("sort") ?? "upcoming";
  const page = Number(params.get("page") ?? "1") || 1;

  const filters = useQuery({
    queryKey: ["public", "tour-filters"],
    queryFn: () => api.get<TourFiltersDTO>("/api/public/tours/filters"),
    staleTime: 5 * 60_000,
  });
  const listParams = { ...current, sort, page, pageSize: 12 };
  const tours = useQuery({
    queryKey: ["public", "tours", listParams],
    queryFn: () => api.get<Paginated<TourCardDTO>>(`/api/public/tours${queryString(listParams)}`),
    placeholderData: keepPreviousData,
  });

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };
  const activeCount = FILTER_KEYS.filter((k) => current[k]).length;
  const clearAll = () => {
    setSearch("");
    setParams(sort !== "upcoming" ? { sort } : {}, { replace: true });
  };

  return (
    <>
      <section className="bg-forest-700 pt-16 pb-24 text-white">
        <div className="container-page">
          <p className="eyebrow text-sun-300">Explore</p>
          <h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">Find your next journey</h1>
          <p className="mt-4 max-w-xl text-forest-100">Search scheduled trips by destination, date and budget. Every tour shows live seat availability.</p>
          <form
            role="search"
            className="mt-8 flex max-w-2xl gap-2 rounded-full bg-white p-1.5 shadow-lift"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: search.trim() || null });
            }}
          >
            <label htmlFor="tour-search" className="sr-only">Search tours</label>
            <div className="flex flex-1 items-center gap-2 pl-4">
              <Search className="size-5 text-sage-500" />
              <input
                id="tour-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tour name or destination"
                className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-stone-400"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </div>
      </section>

      <div className="container-page -mt-10 pb-24">
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Filters */}
          <aside className={cn("lg:block", showFilters ? "block" : "hidden")} aria-label="Filters">
            <div className="space-y-5 rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60 lg:sticky lg:top-32">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-base font-semibold text-forest-900">Filters</h2>
                {activeCount > 0 && (
                  <button onClick={clearAll} className="text-xs font-semibold text-forest-700 underline underline-offset-4">Clear all</button>
                )}
              </div>
              <div>
                <FilterLabel htmlFor="f-category">Category</FilterLabel>
                <Select id="f-category" value={current.category} onChange={(e) => update({ category: e.target.value })}>
                  <option value="">All categories</option>
                  {filters.data?.categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <FilterLabel htmlFor="f-destination">Destination</FilterLabel>
                <Select id="f-destination" value={current.destination} onChange={(e) => update({ destination: e.target.value })}>
                  <option value="">All destinations</option>
                  {filters.data?.destinations.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </div>
              <div>
                <FilterLabel htmlFor="f-country">Country</FilterLabel>
                <Select id="f-country" value={current.country} onChange={(e) => update({ country: e.target.value })}>
                  <option value="">All countries</option>
                  {filters.data?.countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FilterLabel htmlFor="f-from">From</FilterLabel>
                  <Input id="f-from" type="date" value={current.from} onChange={(e) => update({ from: e.target.value })} />
                </div>
                <div>
                  <FilterLabel htmlFor="f-to">To</FilterLabel>
                  <Input id="f-to" type="date" value={current.to} min={current.from || undefined} onChange={(e) => update({ to: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FilterLabel htmlFor="f-min">Min price</FilterLabel>
                  <Input id="f-min" type="number" min={0} inputMode="numeric" placeholder="0" defaultValue={current.minPrice} onBlur={(e) => update({ minPrice: e.target.value })} />
                </div>
                <div>
                  <FilterLabel htmlFor="f-max">Max price</FilterLabel>
                  <Input id="f-max" type="number" min={0} inputMode="numeric" placeholder="Any" defaultValue={current.maxPrice} onBlur={(e) => update({ maxPrice: e.target.value })} />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted">Prices per person, in the tour's currency (RWF).</p>
              <label className="flex items-center gap-3 text-sm font-medium text-forest-900">
                <input type="checkbox" className="size-4 accent-forest-700" checked={current.featured === "1"} onChange={(e) => update({ featured: e.target.checked ? "1" : null })} />
                Featured tours only
              </label>
            </div>
          </aside>

          {/* Results */}
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white px-5 py-4 shadow-card ring-1 ring-line/60">
              <p className="text-sm text-muted" aria-live="polite">
                {tours.data ? (
                  <><span className="font-semibold text-forest-900">{tours.data.total}</span> tour{tours.data.total === 1 ? "" : "s"} found</>
                ) : (
                  "Searching…"
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-forest-700 ring-1 ring-line lg:hidden"
                  onClick={() => setShowFilters((s) => !s)}
                  aria-expanded={showFilters}
                >
                  {showFilters ? <X className="size-4" /> : <SlidersHorizontal className="size-4" />} Filters{activeCount ? ` (${activeCount})` : ""}
                </button>
                <label htmlFor="sort" className="sr-only">Sort by</label>
                <Select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value === "upcoming" ? null : e.target.value })} className="w-auto rounded-full py-2">
                  <option value="upcoming">Upcoming departure</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="newest">Newest</option>
                </Select>
              </div>
            </div>

            {tours.isPending ? (
              <PageLoader label="Finding tours" />
            ) : tours.isError ? (
              <ErrorState message="We couldn't load tours." onRetry={() => tours.refetch()} />
            ) : tours.data.items.length === 0 ? (
              <EmptyState
                icon={<Compass className="size-6" />}
                title="No tours match your search"
                action={activeCount > 0 ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button> : undefined}
              >
                Try different dates or destinations, or contact us to arrange a private trip.
              </EmptyState>
            ) : (
              <>
                <div className={cn("grid gap-8 sm:grid-cols-2 xl:grid-cols-3 transition-opacity", tours.isFetching && "opacity-60")}>
                  {tours.data.items.map((t) => <TourCard key={t.id} tour={t} />)}
                </div>
                <div className="mt-12">
                  <Pagination
                    page={tours.data.page}
                    totalPages={tours.data.totalPages}
                    onChange={(p) => {
                      update({ page: String(p) });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
