import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Clock, MapPin, Minus, Plus, ShieldCheck } from "lucide-react";
import type { BookingCreatedDTO, TourDetailDTO } from "@shared/types";
import { formatMoney } from "@shared/money";
import { calculateQuote } from "@shared/pricing";
import { formatDate, formatTime } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { useSettings } from "@client/hooks/useSettings";
import { useCustomer } from "@client/hooks/useCustomer";
import { cn } from "@client/lib/cn";
import { Button, ButtonLink } from "@client/components/ui/Button";
import { Checkbox, Field, FormError, Input, Textarea } from "@client/components/ui/Field";
import { Badge } from "@client/components/ui/Badge";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { availabilityText } from "@client/components/site/TourCard";
import { TourImage } from "@client/components/site/TourImage";

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
      <div>
        <p className="font-semibold text-forest-900">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} className="rounded-full p-2 ring-1 ring-line hover:bg-forest-50 disabled:opacity-40" aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="size-4" />
        </button>
        <span className="w-6 text-center text-lg font-semibold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} className="rounded-full p-2 ring-1 ring-line hover:bg-forest-50 disabled:opacity-40" aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function BookingPage() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const query = useQuery({
    queryKey: ["public", "tour", slug],
    queryFn: () => api.get<TourDetailDTO>(`/api/public/tours/${encodeURIComponent(slug)}`),
  });
  const tour = query.data;
  useDocumentMeta(tour ? `Book ${tour.title} | Her Journey Tours and Travels` : undefined);

  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [form, setForm] = useState({ customerName: "", customerEmail: "", customerPhone: "", specialRequests: "" });
  // Fill in a signed-in traveller's details once, without overwriting anything typed.
  const { data: customer } = useCustomer();
  const [prefilledFor, setPrefilledFor] = useState<number | null>(null);
  if (customer && prefilledFor !== customer.id) {
    setPrefilledFor(customer.id);
    setForm((f) => ({
      ...f,
      customerName: f.customerName || customer.fullName,
      customerEmail: f.customerEmail || customer.email,
      customerPhone: f.customerPhone || (customer.phone ?? ""),
    }));
  }
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const bookable = tour?.departures.filter((d) => d.bookable) ?? [];
  const departureId = Number(params.get("departure")) || bookable[0]?.id;
  const departure = tour?.departures.find((d) => d.id === departureId && d.bookable) ?? bookable[0];

  const totalGuests = adults + children;
  const seatLimit = departure?.seatsAvailable ?? Infinity;
  const groupLimit = tour?.maxGroupSize ?? Infinity;
  const maxGuests = Math.min(seatLimit, groupLimit, 200);

  const quote = useMemo(() => {
    if (!tour || !departure) return null;
    return calculateQuote(
      {
        ...tour.pricing,
        adultPrice: departure.adultPriceOverride ?? tour.pricing.adultPrice,
        childPrice: departure.childPriceOverride ?? tour.pricing.childPrice,
        discountPrice: departure.adultPriceOverride != null ? null : tour.pricing.discountPrice,
      },
      adults,
      children,
    );
  }, [tour, departure, adults, children]);

  const create = useMutation({
    mutationFn: () =>
      api.post<BookingCreatedDTO>("/api/public/bookings", {
        departureId: departure?.id,
        adults,
        children,
        ...form,
        guestNames: guestNames.slice(0, totalGuests - 1).filter((n) => n.trim()),
        acceptTerms,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["account", "bookings"] });
      navigate(`/booking/${res.reference}?t=${encodeURIComponent(res.accessToken)}`, { replace: true });
    },
  });
  const errors = fieldErrors(create.error);

  if (query.isPending) return <PageLoader label="Preparing your booking" />;
  if (query.isError || !tour) return <div className="container-page py-24"><ErrorState message="We couldn't load this tour." onRetry={() => query.refetch()} /></div>;
  if (!departure || !tour.bookingOpen) {
    return (
      <div className="container-page py-24">
        <EmptyState title="No dates are open for booking" action={<ButtonLink to={`/tours/${tour.slug}`}>Back to the tour</ButtonLink>}>
          This tour has no departures accepting bookings right now. Please contact us for upcoming dates.
        </EmptyState>
      </div>
    );
  }
  const cover = tour.images.find((i) => i.kind === "cover") ?? tour.images[0];
  const cur = tour.pricing.currency;

  return (
    <div className="container-page py-10 pb-24">
      <Link to={`/tours/${tour.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline">
        <ArrowLeft className="size-4" /> Back to tour
      </Link>
      <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Book your trip</h1>
      <p className="mt-2 text-muted">Reserve your seats now and pay with MoMo Pay. Your booking is confirmed once we verify your payment.</p>

      <form
        className="mt-10 grid gap-10 lg:grid-cols-[1fr_400px]"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        noValidate
      >
        <div className="space-y-10">
          <section>
            <h2 className="font-sans text-lg font-semibold text-forest-900">1. Choose your departure</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {tour.departures.map((d) => {
                const a = availabilityText(d);
                return (
                  <label
                    key={d.id}
                    className={cn(
                      "flex cursor-pointer flex-col gap-2 rounded-2xl bg-white p-4 ring-1 transition-colors",
                      !d.bookable && "cursor-not-allowed opacity-55",
                      departure.id === d.id ? "ring-2 ring-forest-600" : "ring-line hover:ring-forest-300",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="departure"
                        className="accent-forest-700"
                        checked={departure.id === d.id}
                        disabled={!d.bookable}
                        onChange={() => setParams({ departure: String(d.id) }, { replace: true })}
                      />
                      <span className="font-semibold text-forest-900">{formatDate(d.startDate, true)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 pl-7 text-xs text-muted">
                      {d.departureTime && <span>Departs {formatTime(d.departureTime)}</span>}
                      <Badge tone={a.tone}>{a.text}</Badge>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="font-sans text-lg font-semibold text-forest-900">2. Who's travelling?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Stepper label="Adults" hint="At least one adult per booking" value={adults} min={1} max={maxGuests - children} onChange={setAdults} />
              <Stepper label="Children" hint={tour.pricing.childPrice === null ? "Charged at the per-person rate" : "Child rate applies"} value={children} min={0} max={maxGuests - adults} onChange={setChildren} />
            </div>
            {errors.adults && <p className="mt-2 text-xs font-medium text-danger-600">{errors.adults}</p>}
            <p className="mt-3 text-xs text-muted">
              {departure.seatsAvailable !== null && `${departure.seatsAvailable} seat${departure.seatsAvailable === 1 ? "" : "s"} available on this date. `}
              {tour.maxGroupSize && `Up to ${tour.maxGroupSize} guests per booking.`}
            </p>
          </section>

          <section>
            <h2 className="font-sans text-lg font-semibold text-forest-900">3. Your details</h2>
            {customer === null && (
              <p className="mt-2 text-sm text-muted">
                Have an account?{" "}
                <Link to="/login" state={{ from: `${location.pathname}${location.search}` }} className="font-semibold text-forest-700 underline underline-offset-4">Log in</Link>{" "}
                to fill this in and keep the booking in your account. Or continue as a guest.
              </p>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required error={errors.customerName} className="sm:col-span-2">
                {(p) => <Input {...p} autoComplete="name" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} maxLength={120} required />}
              </Field>
              <Field label="Email" required error={errors.customerEmail} hint="We'll send your booking details here.">
                {(p) => <Input {...p} type="email" autoComplete="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} required />}
              </Field>
              <Field label="Phone number" required error={errors.customerPhone} hint="Preferably the number you'll pay with.">
                {(p) => <Input {...p} type="tel" autoComplete="tel" inputMode="tel" placeholder="07XX XXX XXX" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} required />}
              </Field>
            </div>

            {totalGuests > 1 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-forest-900">Other guests' names <span className="font-normal text-muted">(optional)</span></p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: totalGuests - 1 }, (_, i) => (
                    <Input
                      key={i}
                      aria-label={`Guest ${i + 2} name`}
                      placeholder={`Guest ${i + 2}${i + 1 >= adults ? " (child)" : ""}`}
                      value={guestNames[i] ?? ""}
                      maxLength={120}
                      onChange={(e) => {
                        const next = [...guestNames];
                        next[i] = e.target.value;
                        setGuestNames(next);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <Field label="Special requests" error={errors.specialRequests} className="mt-6" hint="Dietary needs, accessibility, celebrations… we'll do our best.">
              {(p) => <Textarea {...p} rows={3} value={form.specialRequests} onChange={(e) => setForm({ ...form, specialRequests: e.target.value })} maxLength={1000} />}
            </Field>
          </section>
        </div>

        {/* Summary */}
        <aside>
          <div className="space-y-5 rounded-3xl bg-white p-6 shadow-lift ring-1 ring-line/60 lg:sticky lg:top-32">
            <div className="flex gap-4">
              <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-sand"><TourImage image={cover} sizes="80px" /></div>
              <div>
                <h2 className="font-sans text-base leading-snug font-semibold text-forest-900">{tour.title}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><MapPin className="size-3.5" />{tour.destination}</p>
              </div>
            </div>
            <ul className="space-y-2 rounded-2xl bg-ivory p-4 text-sm">
              <li className="flex items-center gap-2"><CalendarDays className="size-4 text-sage-500" />{formatDate(departure.startDate, true)}</li>
              {departure.departureTime && <li className="flex items-center gap-2"><Clock className="size-4 text-sage-500" />Departs {formatTime(departure.departureTime)}</li>}
              {tour.pickupLocation && <li className="flex items-center gap-2"><MapPin className="size-4 text-sage-500" />Pickup: {tour.pickupLocation}</li>}
            </ul>

            {quote && (
              <div>
                <dl className="space-y-2 text-sm">
                  {quote.lines.map((l) => (
                    <div key={l.label} className="flex justify-between gap-3">
                      <dt className="text-muted">{l.label}{l.quantity > 1 || tour.pricing.pricingBasis === "per_person" ? ` × ${l.quantity}` : ""}</dt>
                      <dd className="font-medium">{formatMoney(l.amount, cur)}</dd>
                    </div>
                  ))}
                  {quote.discountAmount > 0 && (
                    <div className="flex justify-between gap-3 text-forest-700">
                      <dt>You save</dt>
                      <dd className="font-medium">− {formatMoney(quote.discountAmount, cur)}</dd>
                    </div>
                  )}
                </dl>
                <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
                  <span className="text-sm font-semibold text-forest-900">Total ({totalGuests} guest{totalGuests === 1 ? "" : "s"})</span>
                  <span className="text-2xl font-bold text-forest-900">{formatMoney(quote.totalAmount, cur)}</span>
                </div>
              </div>
            )}

            <Checkbox
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              label="I confirm my details are correct"
              description={`My seats are held for ${settings?.bookingHoldMinutes ?? 120} minutes while I pay. Unpaid bookings expire automatically.`}
            />
            {errors.acceptTerms && <p className="-mt-3 text-xs font-medium text-danger-600">{errors.acceptTerms}</p>}

            <FormError message={create.isError ? errorMessage(create.error) : null} />
            <Button type="submit" size="lg" variant="accent" className="w-full" loading={create.isPending} disabled={!acceptTerms}>
              Continue to payment
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-forest-600" /> No payment is taken on this page
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
