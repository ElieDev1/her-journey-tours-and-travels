import { Link } from "react-router";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import type { TourCardDTO } from "@shared/types";
import { formatMoney } from "@shared/money";
import { dateParts, formatDate } from "@shared/time";
import { Badge } from "@client/components/ui/Badge";
import { TourImage } from "./TourImage";

export function availabilityText(dep: TourCardDTO["nextDeparture"]): { text: string; tone: "green" | "gold" | "red" | "gray" } {
  if (!dep) return { text: "Dates to be announced", tone: "gray" };
  if (!dep.bookable) return { text: dep.unavailableReason ?? "Unavailable", tone: "red" };
  if (dep.seatsAvailable === null) return { text: "Seats available", tone: "green" };
  if (dep.seatsAvailable <= 5) return { text: `Only ${dep.seatsAvailable} seat${dep.seatsAvailable === 1 ? "" : "s"} left`, tone: "gold" };
  return { text: `${dep.seatsAvailable} seats available`, tone: "green" };
}

export function TourCard({ tour }: { tour: TourCardDTO }) {
  const dep = tour.nextDeparture;
  const availability = availabilityText(dep);
  const discounted = tour.fromPrice < tour.pricing.adultPrice;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        <TourImage image={tour.cover} fallbackAlt={tour.title} className="transition-transform duration-700 group-hover:scale-[1.04]" sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" />
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          {tour.isFeatured && <Badge tone="gold" className="bg-sun-400 text-forest-950 ring-0">Featured</Badge>}
          {tour.isPopular && <Badge tone="green" className="bg-white text-forest-800 ring-0">Popular</Badge>}
          {discounted && <Badge tone="red" className="bg-danger-600 text-white ring-0">Offer</Badge>}
        </div>
        {dep && (
          <div className="absolute right-4 bottom-4 rounded-2xl bg-white/95 px-3 py-2 text-center shadow-card backdrop-blur">
            <p className="text-[0.65rem] font-semibold tracking-wider text-sage-600 uppercase">{dateParts(dep.startDate).month}</p>
            <p className="font-display text-2xl leading-none font-semibold text-forest-900">{dateParts(dep.startDate).day}</p>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        {tour.category && <p className="eyebrow">{tour.category.name}</p>}
        <h3 className="mt-2 text-2xl leading-tight font-semibold">
          <Link to={`/tours/${tour.slug}`} className="after:absolute after:inset-0 hover:text-forest-700">
            {tour.title}
          </Link>
        </h3>
        <ul className="mt-4 mb-6 space-y-2 text-sm text-muted">
          <li className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-sage-500" /> {tour.destination}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-sage-500" /> {dep ? formatDate(dep.startDate, true) : "Dates to be announced"}
          </li>
          {tour.durationText && (
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-sage-500" /> {tour.durationText}
            </li>
          )}
          <li className="flex items-center gap-2">
            <Users className="size-4 shrink-0 text-sage-500" />
            <Badge tone={availability.tone}>{availability.text}</Badge>
          </li>
        </ul>

        <div className="mt-auto flex items-end justify-between gap-4 border-t border-line pt-5">
          <div>
            <p className="text-xs text-muted">From</p>
            <p className="text-xl font-semibold text-forest-800">
              {formatMoney(tour.fromPrice, tour.pricing.currency)}
            </p>
            {discounted && <p className="text-xs text-muted line-through">{formatMoney(tour.pricing.adultPrice, tour.pricing.currency)}</p>}
            <p className="text-xs text-muted">{tour.pricing.pricingBasis === "per_person" ? "per person" : "per group"}</p>
          </div>
          <span className="relative z-10 rounded-full bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-forest-800">
            View Details
          </span>
        </div>
      </div>
    </article>
  );
}
