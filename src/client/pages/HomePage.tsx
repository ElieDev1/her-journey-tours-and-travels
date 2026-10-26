import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Compass,
  HeartHandshake,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import type { HomeDTO } from "@shared/types";
import { formatMoney } from "@shared/money";
import { dateParts, formatTime } from "@shared/time";
import { api } from "@client/lib/api";
import { useSettings } from "@client/hooks/useSettings";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { formatPhone, telHref, whatsappHref } from "@client/lib/contact";
import { TourCard, availabilityText } from "@client/components/site/TourCard";
import { TourImage } from "@client/components/site/TourImage";
import { SectionHeading } from "@client/components/site/SectionHeading";
import { PartnerLogos, TrustSeal } from "@client/components/site/Partners";
import { Button, ButtonLink } from "@client/components/ui/Button";
import { Badge } from "@client/components/ui/Badge";
import { Input, Textarea } from "@client/components/ui/Field";
import { EmptyState, ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";

const reasons = [
  { icon: Compass, title: "Thoughtfully planned trips", text: "Transport, guiding, entrance fees and meals arranged end to end, so you can simply enjoy the journey." },
  { icon: HeartHandshake, title: "Warm, local guidance", text: "Friendly guides who know the places, the stories and the best spots for photographs." },
  { icon: Wallet, title: "Clear, upfront pricing", text: "See exactly what is included and what you will pay before you book. No surprises." },
  { icon: ShieldCheck, title: "Simple, secure booking", text: "Reserve online in minutes and pay with MoMo Pay. We confirm every payment personally." },
];

function HeroSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    navigate(`/tours${params.size ? `?${params}` : ""}`);
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl bg-white p-3 shadow-lift sm:grid-cols-[1fr_200px_auto]" role="search">
      <label className="flex items-center gap-3 rounded-2xl px-4 py-2 ring-line focus-within:ring-2 focus-within:ring-forest-500/30">
        <MapPin className="size-5 shrink-0 text-sage-500" />
        <span className="sr-only">Destination or tour</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Where would you like to go?"
          className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-stone-400"
        />
      </label>
      <label className="flex items-center gap-3 rounded-2xl px-4 py-2 ring-line focus-within:ring-2 focus-within:ring-forest-500/30 sm:border-l sm:border-line sm:rounded-none">
        <CalendarDays className="size-5 shrink-0 text-sage-500" />
        <span className="sr-only">Departing from</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full bg-transparent py-2 text-sm text-ink outline-none" />
      </label>
      <Button type="submit" size="lg" icon={<Search className="size-4" />}>
        Search tours
      </Button>
    </form>
  );
}

function ContactSection() {
  const { data: s } = useSettings();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  if (!s) return null;
  const whatsapp = s.whatsappNumber ?? s.phonePrimary;
  return (
    <section id="contact" className="bg-sand py-20 sm:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Talk to us</p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Plan your next journey with us</h2>
          <p className="mt-4 max-w-lg text-muted">
            Questions about a trip, a private group or a special request? Call, send a WhatsApp message or email us. We are happy to help.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[s.phonePrimary, s.phoneSecondary].filter((p): p is string => Boolean(p)).map((phone) => (
              <a key={phone} href={telHref(phone)} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/60 hover:ring-forest-300">
                <span className="rounded-full bg-forest-50 p-3 text-forest-700"><Phone className="size-5" /></span>
                <span>
                  <span className="block text-xs text-muted">Call us</span>
                  <span className="font-semibold text-forest-900">{formatPhone(phone)}</span>
                </span>
              </a>
            ))}
            {whatsapp && (
              <a href={whatsappHref(whatsapp)} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/60 hover:ring-forest-300">
                <span className="rounded-full bg-forest-50 p-3 text-forest-700"><MessageCircle className="size-5" /></span>
                <span>
                  <span className="block text-xs text-muted">WhatsApp</span>
                  <span className="font-semibold text-forest-900">Chat with us</span>
                </span>
              </a>
            )}
            {s.contactEmail && (
              <a href={`mailto:${s.contactEmail}`} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-line/60 hover:ring-forest-300">
                <span className="rounded-full bg-forest-50 p-3 text-forest-700"><MessageCircle className="size-5" /></span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted">Email</span>
                  <span className="block truncate font-semibold text-forest-900">{s.contactEmail}</span>
                </span>
              </a>
            )}
          </div>
        </div>
        {whatsapp && (
          <form
            className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              const text = `Hello ${s.companyName}, my name is ${name}. ${message}`;
              window.open(whatsappHref(whatsapp, text), "_blank", "noopener");
            }}
          >
            <h3 className="font-sans text-lg font-semibold text-forest-900">Send us a quick message</h3>
            <p className="mt-1 text-sm text-muted">Your message opens in WhatsApp so we can reply straight away.</p>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-forest-900">
                Your name
                <Input className="mt-1.5" required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </label>
              <label className="block text-sm font-medium text-forest-900">
                Message
                <Textarea className="mt-1.5" required value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="I'd like to ask about…" />
              </label>
              <Button type="submit" className="w-full" icon={<MessageCircle className="size-4" />}>
                Send on WhatsApp
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export function HomePage() {
  const { data: settings } = useSettings();
  const home = useQuery({ queryKey: ["public", "home"], queryFn: () => api.get<HomeDTO>("/api/public/home") });
  useDocumentMeta(settings ? `${settings.companyName} | Guided Tours & Trips in Rwanda` : undefined, settings?.heroSubtitle);
  const data = home.data;

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-forest-800 text-white">
        <img
          src={settings?.heroImageUrl ?? "/images/placeholders/hero-landscape.svg"}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-950/85 via-forest-900/55 to-forest-900/10" />
        <div className="container-page flex min-h-[78vh] flex-col justify-center py-24 lg:min-h-[640px]">
          <div className="max-w-2xl animate-fade-up">
            <p className="eyebrow text-sun-300">{settings?.companyName ?? "Her Journey Tours and Travels"}</p>
            <h1 className="mt-4 text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
              {settings?.heroTitle ?? "Discover Rwanda, one unforgettable journey at a time"}
            </h1>
            {settings?.heroSubtitle && <p className="mt-6 max-w-xl text-lg leading-relaxed text-forest-100">{settings.heroSubtitle}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/tours" variant="accent" size="lg" icon={<Compass className="size-5" />}>
                Explore tours
              </ButtonLink>
              <a href="#upcoming" className="inline-flex h-13 items-center gap-2 rounded-full px-6 text-base font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                Upcoming trips <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
          <div className="mt-14 max-w-4xl animate-fade-up [animation-delay:150ms]">
            <HeroSearch />
          </div>
        </div>
      </section>

      {home.isPending && <PageLoader label="Loading tours" />}
      {home.isError && (
        <div className="container-page py-16">
          <ErrorState message="We couldn't load our tours right now." onRetry={() => home.refetch()} />
        </div>
      )}

      {data && (
        <>
          {/* Featured */}
          <section className="py-20 sm:py-28">
            <div className="container-page">
              <SectionHeading
                eyebrow="Featured journeys"
                title="Trips our travellers love"
                action={<ButtonLink to="/tours" variant="secondary" icon={<ArrowRight className="size-4" />}>View all tours</ButtonLink>}
              >
                Hand-picked experiences with everything arranged for you, from pickup to the last photograph.
              </SectionHeading>
              {data.featured.length ? (
                <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {data.featured.map((t) => <TourCard key={t.id} tour={t} />)}
                </div>
              ) : (
                <div className="mt-12"><EmptyState title="New tours are coming soon">Follow us or get in touch to hear about our next trips.</EmptyState></div>
              )}
            </div>
          </section>

          {/* Upcoming departures */}
          <section id="upcoming" className="scroll-mt-28 bg-white py-20 sm:py-28">
            <div className="container-page">
              <SectionHeading eyebrow="Upcoming scheduled trips" title="Reserve your seat">
                Fixed-date departures you can join on your own, with family or with friends.
              </SectionHeading>
              {data.upcoming.length ? (
                <ul className="mt-12 divide-y divide-line overflow-hidden rounded-3xl ring-1 ring-line">
                  {data.upcoming.map(({ tour, departure }) => {
                    const parts = dateParts(departure.startDate);
                    const availability = availabilityText(departure);
                    return (
                      <li key={departure.id} className="group relative grid items-center gap-5 bg-white p-5 transition-colors hover:bg-forest-50/50 sm:grid-cols-[auto_1fr_auto] sm:p-6">
                        <div className="flex size-20 flex-col items-center justify-center rounded-2xl bg-forest-700 text-white">
                          <span className="text-[0.65rem] font-semibold tracking-wider text-sun-300 uppercase">{parts.month}</span>
                          <span className="text-2xl leading-none font-bold">{parts.day}</span>
                          <span className="text-[0.65rem] text-forest-200">{parts.weekday}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">
                            <Link to={`/tours/${tour.slug}`} className="after:absolute after:inset-0">{tour.title}</Link>
                          </h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                            <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-sage-500" />{tour.destination}</span>
                            {departure.departureTime && <span>Departs {formatTime(departure.departureTime)}</span>}
                            <Badge tone={availability.tone}>{availability.text}</Badge>
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-6 sm:flex-col sm:items-end">
                          <p className="text-lg font-semibold text-forest-800">{formatMoney(tour.fromPrice, tour.pricing.currency)}</p>
                          <span className="relative z-10 inline-flex items-center gap-1 text-sm font-semibold text-forest-700">
                            Book now <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-12"><EmptyState icon={<CalendarDays className="size-6" />} title="No departures scheduled right now">New dates are added regularly. Contact us to plan a private trip.</EmptyState></div>
              )}
            </div>
          </section>

          {/* Destinations */}
          {data.destinations.length > 0 && (
            <section className="py-20 sm:py-28">
              <div className="container-page">
                <SectionHeading eyebrow="Popular destinations" title="Where we travel" />
                <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {data.destinations.map((d) => (
                    <Link
                      key={`${d.destination}-${d.country}`}
                      to={`/tours?destination=${encodeURIComponent(d.destination)}`}
                      className="group relative isolate flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-3xl p-6 text-white shadow-card"
                    >
                      <div className="absolute inset-0 -z-10 transition-transform duration-700 group-hover:scale-105">
                        <TourImage image={d.cover} fallbackAlt={d.destination} sizes="(min-width: 1024px) 25vw, 50vw" />
                      </div>
                      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950/85 via-forest-950/20 to-transparent" />
                      <p className="text-xs font-semibold tracking-[0.2em] text-sun-300 uppercase">{d.country}</p>
                      <h3 className="mt-1 text-xl font-bold text-white">{d.destination}</h3>
                      <p className="mt-1 text-sm text-forest-100">{d.tourCount} tour{d.tourCount === 1 ? "" : "s"}</p>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Categories */}
          <section className="bg-forest-700 py-20 text-white sm:py-24">
            <div className="container-page">
              <p className="eyebrow text-sage-300">Tour categories</p>
              <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Find your kind of journey</h2>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.categories.map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/tours?category=${cat.slug}`}
                    className="group flex items-center justify-between gap-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 transition-colors hover:bg-white/10"
                  >
                    <div>
                      <h3 className="font-sans text-base font-semibold text-white">{cat.name}</h3>
                      {cat.description && <p className="mt-1 text-sm text-forest-200">{cat.description}</p>}
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-sm text-sun-300">
                      {cat.tourCount ?? 0}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Why choose us */}
          <section className="py-20 sm:py-28">
            <div className="container-page">
              <SectionHeading center eyebrow="Why travel with us" title={`Why choose ${settings?.companyName ?? "Her Journey"}`}>
                {settings?.aboutText}
              </SectionHeading>
              <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {reasons.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-3xl bg-white p-7 shadow-card ring-1 ring-line/60">
                    <span className="inline-flex rounded-2xl bg-sun-100 p-3 text-sun-700"><Icon className="size-6" /></span>
                    <h3 className="mt-5 font-sans text-lg font-semibold text-forest-900">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-14 grid items-center gap-8 rounded-3xl bg-white p-8 shadow-card ring-1 ring-line/60 md:grid-cols-[auto_1fr]">
                <div className="flex items-center gap-5">
                  <TrustSeal className="h-28" />
                  <div>
                    <p className="eyebrow">Verified business</p>
                    <h3 className="mt-1 font-sans text-lg font-semibold text-forest-900">A trusted, registered company</h3>
                  </div>
                </div>
                <div className="md:border-l md:border-line md:pl-8">
                  <p className="eyebrow">Our partners</p>
                  <PartnerLogos className="mt-4" />
                </div>
              </div>
            </div>
          </section>

          {/* Testimonials (only real, moderated reviews) */}
          {data.testimonials.length > 0 && (
            <section className="bg-white py-20 sm:py-28">
              <div className="container-page">
                <SectionHeading center eyebrow="Testimonials" title="What our travellers say" />
                <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {data.testimonials.map((r) => (
                    <figure key={r.id} className="flex flex-col rounded-3xl bg-ivory p-7 ring-1 ring-line/60">
                      <div className="flex gap-0.5 text-sun-500" aria-label={`${r.rating} out of 5 stars`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`size-4 ${i < r.rating ? "fill-current" : "opacity-30"}`} />
                        ))}
                      </div>
                      {r.title && <p className="mt-4 font-semibold text-forest-900">{r.title}</p>}
                      <blockquote className="mt-2 flex-1 text-base leading-relaxed text-forest-900">“{r.body}”</blockquote>
                      <figcaption className="mt-6 text-sm">
                        <span className="font-semibold text-forest-800">{r.authorName}</span>
                        {r.authorLocation && <span className="text-muted"> · {r.authorLocation}</span>}
                        {r.tourTitle && <span className="block text-xs text-muted">{r.tourTitle}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <ContactSection />
    </>
  );
}
