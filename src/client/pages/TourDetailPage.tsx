import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  AlertTriangle,
  Backpack,
  Bed,
  Bus,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Gauge,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  User,
  Users,
  Utensils,
  X,
} from "lucide-react";
import type { DepartureDTO, TourDetailDTO } from "@shared/types";
import { formatMoney } from "@shared/money";
import { discountPercentOf, effectiveUnitPrices } from "@shared/pricing";
import { formatDate, formatDateTime, formatTime } from "@shared/time";
import { api, ApiError } from "@client/lib/api";
import { useSettings } from "@client/hooks/useSettings";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { formatPhone, telHref, whatsappHref } from "@client/lib/contact";
import { cn } from "@client/lib/cn";
import { Gallery } from "@client/components/tour/Gallery";
import { ReviewForm } from "@client/components/tour/ReviewForm";
import { mapEmbedUrl, mapLinkUrl, videoEmbedUrl } from "@client/components/tour/embeds";
import { availabilityText } from "@client/components/site/TourCard";
import { TourImage } from "@client/components/site/TourImage";
import { Badge } from "@client/components/ui/Badge";
import { Button, ButtonLink } from "@client/components/ui/Button";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";

const DIFFICULTY_LABEL = { easy: "Easy", moderate: "Moderate", challenging: "Challenging", strenuous: "Strenuous" } as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-line pt-10">
      <h2 className="text-3xl font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CheckList({ items, negative }: { items: string[]; negative?: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm">
          <span className={cn("mt-0.5 rounded-full p-1", negative ? "bg-danger-50 text-danger-600" : "bg-forest-50 text-forest-700")}>
            {negative ? <X className="size-3.5" /> : <Check className="size-3.5" />}
          </span>
          <span className="text-ink">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-line/70">
      <span className="rounded-xl bg-sun-50 p-2 text-sun-700">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="mt-0.5 text-sm font-semibold text-forest-900">{children}</div>
      </div>
    </div>
  );
}

function priceFor(tour: TourDetailDTO, dep: DepartureDTO | undefined) {
  const p = {
    ...tour.pricing,
    adultPrice: dep?.adultPriceOverride ?? tour.pricing.adultPrice,
    childPrice: dep?.childPriceOverride ?? tour.pricing.childPrice,
    discountPrice: dep?.adultPriceOverride != null ? null : tour.pricing.discountPrice,
  };
  return { ...effectiveUnitPrices(p), base: p.adultPrice, baseChild: p.childPrice, percent: discountPercentOf(p) };
}

function BookingCard({ tour, selectedId, onSelect }: { tour: TourDetailDTO; selectedId: number | null; onSelect: (id: number) => void }) {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const bookable = tour.departures.filter((d) => d.bookable);
  const selected = tour.departures.find((d) => d.id === selectedId) ?? bookable[0];
  const price = priceFor(tour, selected);
  const phone = tour.bookingPhone ?? settings?.phonePrimary;
  const altPhone = tour.alternativePhone ?? settings?.phoneSecondary;
  const whatsapp = tour.whatsappNumber ?? settings?.whatsappNumber;
  const email = tour.bookingEmail ?? settings?.contactEmail;
  const cur = tour.pricing.currency;

  return (
    <div className="rounded-3xl bg-white p-6 shadow-lift ring-1 ring-line/60">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">From</p>
          <p className="font-display text-4xl font-semibold text-forest-900">{formatMoney(price.adult, cur)}</p>
          {price.adult < price.base && <p className="text-sm text-muted line-through">{formatMoney(price.base, cur)}</p>}
          <p className="text-xs text-muted">{tour.pricing.pricingBasis === "per_person" ? "per person" : "per group"}</p>
        </div>
        {price.percent ? <Badge tone="red" className="bg-danger-600 text-white ring-0">Save {price.percent}%</Badge> : null}
      </div>

      {tour.pricing.pricingBasis === "per_person" && (
        <dl className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-ivory p-3 text-xs">
          <div><dt className="text-muted">Adult</dt><dd className="font-semibold text-forest-900">{formatMoney(price.adult, cur)}</dd></div>
          <div><dt className="text-muted">Child</dt><dd className="font-semibold text-forest-900">{price.baseChild === null ? "Same as adult" : formatMoney(price.child, cur)}</dd></div>
          {tour.pricing.additionalFees > 0 && (
            <div className="col-span-2">
              <dt className="text-muted">Additional fees ({tour.pricing.additionalFeesBasis === "per_person" ? "per person" : "per booking"})</dt>
              <dd className="font-semibold text-forest-900">{formatMoney(tour.pricing.additionalFees, cur)}{tour.pricing.additionalFeesNote ? ` · ${tour.pricing.additionalFeesNote}` : ""}</dd>
            </div>
          )}
        </dl>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-forest-900">Departure date</legend>
        {tour.departures.length === 0 ? (
          <p className="mt-2 text-sm text-muted">New dates will be announced soon. Contact us to be the first to know.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {tour.departures.map((d) => {
              const a = availabilityText(d);
              return (
                <label
                  key={d.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 transition-colors",
                    !d.bookable && "cursor-not-allowed opacity-60",
                    selected?.id === d.id ? "bg-forest-50 ring-2 ring-forest-600" : "ring-line hover:ring-forest-300",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <input type="radio" name="departure" className="accent-forest-700" checked={selected?.id === d.id} disabled={!d.bookable} onChange={() => onSelect(d.id)} />
                    <span>
                      <span className="block text-sm font-semibold text-forest-900">{formatDate(d.startDate)}</span>
                      {d.departureTime && <span className="text-xs text-muted">Departs {formatTime(d.departureTime)}</span>}
                    </span>
                  </span>
                  <Badge tone={a.tone}>{a.text}</Badge>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {selected?.bookingDeadline && selected.bookable && (
        <p className="mt-3 text-xs text-muted">Book before {formatDateTime(selected.bookingDeadline)}</p>
      )}

      <Button
        size="lg"
        variant="accent"
        className="mt-5 w-full"
        disabled={!selected?.bookable || !tour.bookingOpen}
        onClick={() => selected && navigate(`/tours/${tour.slug}/book?departure=${selected.id}`)}
      >
        Book This Tour
      </Button>
      {!tour.bookingOpen && <p className="mt-2 text-center text-xs text-danger-600">Online booking is currently closed for this tour.</p>}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-3.5 text-forest-600" /> Pay with MoMo Pay · confirmed by our team
      </p>

      {(phone || whatsapp || email) && (
        <div className="mt-6 space-y-2 border-t border-line pt-5">
          <p className="text-sm font-semibold text-forest-900">Questions? Talk to us</p>
          {phone && (
            <a href={telHref(phone)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-forest-50">
              <Phone className="size-4 text-forest-600" /> {formatPhone(phone)}
            </a>
          )}
          {altPhone && altPhone !== phone && (
            <a href={telHref(altPhone)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-forest-50">
              <Phone className="size-4 text-forest-600" /> {formatPhone(altPhone)}
            </a>
          )}
          {whatsapp && (
            <a href={whatsappHref(whatsapp, `Hello, I'm interested in "${tour.title}".`)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-forest-50">
              <MessageCircle className="size-4 text-forest-600" /> WhatsApp
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm break-all hover:bg-forest-50">
              <Mail className="size-4 shrink-0 text-forest-600" /> {email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function TourDetailPage() {
  const { slug = "" } = useParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["public", "tour", slug],
    queryFn: () => api.get<TourDetailDTO>(`/api/public/tours/${encodeURIComponent(slug)}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const tour = query.data;
  useDocumentMeta(tour ? (tour.seoTitle ?? `${tour.title} | Her Journey Tours and Travels`) : undefined, tour?.seoDescription ?? tour?.shortDescription);

  if (query.isPending) return <PageLoader label="Loading tour" />;
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="container-page py-24">
        {missing ? (
          <EmptyState title="This tour is no longer available" action={<ButtonLink to="/tours">See all tours</ButtonLink>}>
            It may have been fully booked or removed.
          </EmptyState>
        ) : (
          <ErrorState message="We couldn't load this tour." onRetry={() => query.refetch()} />
        )}
      </div>
    );
  }
  if (!tour) return null;

  const next = tour.nextDeparture;
  const poster = tour.images.find((i) => i.kind === "poster");
  const video = tour.videoUrl ? videoEmbedUrl(tour.videoUrl) : null;
  const placeQuery = [tour.location ?? tour.destination, tour.districtProvince, tour.country].filter(Boolean).join(", ");
  const ageRange =
    tour.minAge !== null && tour.maxAge !== null ? `${tour.minAge}–${tour.maxAge} years` : tour.minAge !== null ? `${tour.minAge}+ years` : tour.maxAge !== null ? `Up to ${tour.maxAge} years` : null;
  const practical = [
    { icon: <Utensils className="size-4" />, label: "Meals", value: tour.meals },
    { icon: <Bus className="size-4" />, label: "Transportation", value: tour.transportation },
    { icon: <Ticket className="size-4" />, label: "Entrance fees", value: tour.entranceFees },
    { icon: <User className="size-4" />, label: "Tour guide", value: tour.guideInfo },
    { icon: <Bed className="size-4" />, label: "Accommodation", value: tour.accommodation },
    { icon: <Accessibility className="size-4" />, label: "Accessibility", value: tour.accessibility },
  ].filter((r) => r.value);

  return (
    <div className="pb-24">
      <div className="container-page pt-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
          <Link to="/" className="hover:text-forest-700">Home</Link>
          <ChevronRight className="size-3.5" />
          <Link to="/tours" className="hover:text-forest-700">Tours</Link>
          <ChevronRight className="size-3.5" />
          <span className="truncate text-forest-900">{tour.title}</span>
        </nav>

        <header className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              {tour.category && <Badge tone="sage">{tour.category.name}</Badge>}
              {tour.isFeatured && <Badge tone="gold">Featured</Badge>}
              {tour.isPopular && <Badge tone="green">Popular</Badge>}
            </div>
            <h1 className="mt-3 text-4xl leading-tight font-semibold sm:text-5xl lg:text-6xl">{tour.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-sage-500" />{tour.destination}, {tour.country}</span>
              {tour.rating && (
                <span className="inline-flex items-center gap-1.5"><Star className="size-4 fill-sun-400 text-sun-500" />{tour.rating.average} ({tour.rating.count} review{tour.rating.count === 1 ? "" : "s"})</span>
              )}
              <span>Operated by {tour.operatorName}</span>
            </p>
          </div>
        </header>

        <div className="mt-8">
          <Gallery images={tour.images} title={tour.title} />
          {tour.images.some((i) => i.isPlaceholder) && (
            <p className="mt-2 text-xs text-muted">Illustrations shown. Photos from this trip will be added soon.</p>
          )}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-10">
            {/* Key facts */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <InfoRow icon={<CalendarDays className="size-4" />} label="Next departure">{next ? formatDate(next.startDate, true) : "To be announced"}</InfoRow>
              {(next?.departureTime ?? tour.departureTime) && (
                <InfoRow icon={<Clock className="size-4" />} label="Departure time">
                  {formatTime(next?.departureTime ?? tour.departureTime)}
                  {(next?.returnTime ?? tour.returnTime) && <span className="font-normal text-muted"> · returns {formatTime(next?.returnTime ?? tour.returnTime)}</span>}
                </InfoRow>
              )}
              {tour.durationText && <InfoRow icon={<Clock className="size-4" />} label="Duration">{tour.durationText}</InfoRow>}
              {tour.pickupLocation && <InfoRow icon={<MapPin className="size-4" />} label="Pickup location">{tour.pickupLocation}</InfoRow>}
              {tour.meetingPoint && <InfoRow icon={<MapPin className="size-4" />} label="Meeting point">{tour.meetingPoint}</InfoRow>}
              {tour.difficultyLevel && <InfoRow icon={<Gauge className="size-4" />} label="Difficulty">{DIFFICULTY_LABEL[tour.difficultyLevel]}</InfoRow>}
              {ageRange && <InfoRow icon={<Users className="size-4" />} label="Suitable ages">{ageRange}</InfoRow>}
              {tour.maxGroupSize && <InfoRow icon={<Users className="size-4" />} label="Max per booking">{tour.maxGroupSize} guests</InfoRow>}
              {tour.minParticipants && <InfoRow icon={<Users className="size-4" />} label="Minimum participants">{tour.minParticipants}</InfoRow>}
            </div>

            {/* Mobile booking card */}
            <div className="lg:hidden">
              <BookingCard tour={tour} selectedId={selectedId} onSelect={setSelectedId} />
            </div>

            <Section id="overview" title="Overview">
              {tour.shortDescription && <p className="text-lg leading-relaxed text-forest-900">{tour.shortDescription}</p>}
              {tour.description && (
                <div className="prose-tour mt-4 leading-relaxed text-ink/85">
                  {tour.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
                </div>
              )}
            </Section>

            {tour.lists.highlight.length > 0 && (
              <Section id="highlights" title="Highlights">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {tour.lists.highlight.map((h) => (
                    <li key={h} className="flex items-start gap-3 rounded-2xl bg-sun-50 p-4 text-sm font-medium text-forest-900">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-sun-600" /> {h}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {tour.lists.activity.length > 0 && (
              <Section id="activities" title="Activities">
                <div className="flex flex-wrap gap-2">
                  {tour.lists.activity.map((a) => <span key={a} className="rounded-full bg-forest-50 px-4 py-2 text-sm font-medium text-forest-800">{a}</span>)}
                </div>
              </Section>
            )}

            {(tour.lists.included.length > 0 || tour.lists.excluded.length > 0) && (
              <Section id="inclusions" title="What's included">
                {tour.lists.included.length > 0 && <CheckList items={tour.lists.included} />}
                {tour.lists.excluded.length > 0 && (
                  <>
                    <h3 className="mt-8 mb-4 font-sans text-base font-semibold text-forest-900">Not included</h3>
                    <CheckList items={tour.lists.excluded} negative />
                  </>
                )}
              </Section>
            )}

            {practical.length > 0 && (
              <Section id="details" title="Trip details">
                <div className="grid gap-3 sm:grid-cols-2">
                  {practical.map((r) => <InfoRow key={r.label} icon={r.icon} label={r.label}>{r.value}</InfoRow>)}
                </div>
                {tour.lists.amenity.length > 0 && (
                  <>
                    <h3 className="mt-8 mb-4 font-sans text-base font-semibold text-forest-900">Amenities</h3>
                    <CheckList items={tour.lists.amenity} />
                  </>
                )}
              </Section>
            )}

            <Section id="schedule" title="Schedule & availability">
              {tour.departures.length === 0 ? (
                <p className="text-sm text-muted">No departure dates are scheduled at the moment.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-sand text-xs text-muted uppercase">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Departure</th>
                        <th className="px-4 py-3 font-semibold">Return</th>
                        <th className="px-4 py-3 font-semibold">Book by</th>
                        <th className="px-4 py-3 font-semibold">Availability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-white">
                      {tour.departures.map((d) => {
                        const a = availabilityText(d);
                        return (
                          <tr key={d.id}>
                            <td className="px-4 py-3 font-semibold text-forest-900">
                              {formatDate(d.startDate)}
                              {d.endDate && d.endDate !== d.startDate && <span className="font-normal text-muted"> – {formatDate(d.endDate)}</span>}
                            </td>
                            <td className="px-4 py-3">{formatTime(d.departureTime) ?? "—"}</td>
                            <td className="px-4 py-3">{formatTime(d.returnTime) ?? "—"}</td>
                            <td className="px-4 py-3">{d.bookingDeadline ? formatDateTime(d.bookingDeadline) : "Until departure"}</td>
                            <td className="px-4 py-3"><Badge tone={a.tone}>{a.text}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {(tour.lists.what_to_bring.length > 0 || tour.safetyInstructions || tour.specialRequirements) && (
              <Section id="prepare" title="Before you go">
                <div className="grid gap-6 md:grid-cols-2">
                  {tour.lists.what_to_bring.length > 0 && (
                    <div className="rounded-3xl bg-white p-6 ring-1 ring-line/70">
                      <h3 className="flex items-center gap-2 font-sans text-base font-semibold text-forest-900"><Backpack className="size-5 text-sage-500" />What to bring</h3>
                      <ul className="mt-4 space-y-2 text-sm">
                        {tour.lists.what_to_bring.map((w) => <li key={w} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-forest-600" />{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {(tour.safetyInstructions || tour.specialRequirements) && (
                    <div className="rounded-3xl bg-white p-6 ring-1 ring-line/70">
                      <h3 className="flex items-center gap-2 font-sans text-base font-semibold text-forest-900"><AlertTriangle className="size-5 text-sun-600" />Safety & requirements</h3>
                      {tour.safetyInstructions && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{tour.safetyInstructions}</p>}
                      {tour.specialRequirements && <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">{tour.specialRequirements}</p>}
                    </div>
                  )}
                </div>
              </Section>
            )}

            <Section id="location" title="Location">
              <p className="mb-4 text-sm text-muted">{placeQuery}</p>
              <div className="aspect-[16/9] overflow-hidden rounded-3xl bg-sand ring-1 ring-line">
                <iframe
                  title={`Map of ${tour.destination}`}
                  src={mapEmbedUrl({ latitude: tour.latitude, longitude: tour.longitude, query: placeQuery })}
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <a
                href={mapLinkUrl({ mapUrl: tour.mapUrl, latitude: tour.latitude, longitude: tour.longitude, query: placeQuery })}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-forest-700 underline underline-offset-4"
              >
                Open in Google Maps
              </a>
            </Section>

            {(video || poster || tour.videoUrl) && (
              <Section id="media" title="Media">
                <div className="grid gap-6 md:grid-cols-2">
                  {video ? (
                    <div className="aspect-video overflow-hidden rounded-3xl bg-forest-950 md:col-span-2">
                      <iframe title={`${tour.title} video`} src={video} className="h-full w-full" loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen />
                    </div>
                  ) : tour.videoUrl ? (
                    <a href={tour.videoUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-forest-700 underline">Watch the video</a>
                  ) : null}
                  {poster && (
                    <a href={poster.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-3xl ring-1 ring-line">
                      <TourImage image={poster} className="h-auto object-contain" sizes="(min-width: 768px) 50vw, 100vw" />
                    </a>
                  )}
                </div>
              </Section>
            )}

            {(tour.cancellationPolicy || tour.terms) && (
              <Section id="policies" title="Policies">
                {tour.cancellationPolicy && (
                  <>
                    <h3 className="font-sans text-base font-semibold text-forest-900">Cancellation policy</h3>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink/85">{tour.cancellationPolicy}</p>
                  </>
                )}
                {tour.terms && (
                  <>
                    <h3 className="mt-6 font-sans text-base font-semibold text-forest-900">Terms</h3>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink/85">{tour.terms}</p>
                  </>
                )}
              </Section>
            )}

            <Section id="reviews" title="Reviews">
              {tour.reviews.length === 0 ? (
                <p className="text-sm text-muted">No reviews yet. Travelled with us? Be the first to share your experience.</p>
              ) : (
                <div className="space-y-4">
                  {tour.reviews.map((r) => (
                    <article key={r.id} className="rounded-3xl bg-white p-6 ring-1 ring-line/70">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-forest-900">{r.authorName}{r.authorLocation && <span className="font-normal text-muted"> · {r.authorLocation}</span>}</p>
                        <div className="flex gap-0.5 text-sun-500" aria-label={`${r.rating} out of 5`}>
                          {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`size-4 ${i < r.rating ? "fill-current" : "opacity-30"}`} />)}
                        </div>
                      </div>
                      {r.title && <p className="mt-3 font-semibold">{r.title}</p>}
                      <p className="mt-1 text-sm leading-relaxed text-ink/85">{r.body}</p>
                    </article>
                  ))}
                </div>
              )}
              <details className="mt-6 rounded-3xl bg-ivory p-6 ring-1 ring-line/70">
                <summary className="cursor-pointer font-semibold text-forest-800">Write a review</summary>
                <div className="mt-5"><ReviewForm slug={tour.slug} /></div>
              </details>
            </Section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-32">
              <BookingCard tour={tour} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
