import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ExternalLink, Save, Trash2 } from "lucide-react";
import type { AdminTourDTO, CategoryDTO, TourLists } from "@shared/types";
import {
  DIFFICULTY_LEVELS,
  FEE_BASES,
  PRICING_BASES,
  TOUR_STATUSES,
  TOUR_STATUS_LABELS,
  type DifficultyLevel,
  type FeeBasis,
  type PricingBasis,
  type TourStatus,
} from "@shared/constants";
import { CURRENCIES, CURRENCY_CODES, formatMoney, toMajor, toMinor } from "@shared/money";
import { calculateQuote } from "@shared/pricing";
import type { TourUpsertInput } from "@shared/schemas";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { Button } from "@client/components/ui/Button";
import { Checkbox, Field, FormError, Input, Select, Textarea } from "@client/components/ui/Field";
import { TourStatusBadge } from "@client/components/ui/Badge";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Panel } from "../components/PageHeader";
import { ListEditor } from "../components/ListEditor";
import { DepartureManager } from "../components/DepartureManager";
import { ImageManager } from "../components/ImageManager";
import { useCan } from "../session";

// ---------- form model ----------

type Text = string;
interface TourForm {
  title: Text; slug: Text; shortDescription: Text; description: Text; categoryId: Text; status: TourStatus;
  isFeatured: boolean; isPopular: boolean; operatorName: Text;
  destination: Text; country: Text; districtProvince: Text; location: Text; mapUrl: Text; latitude: Text; longitude: Text;
  durationText: Text; durationDays: Text; departureTime: Text; returnTime: Text; pickupLocation: Text; meetingPoint: Text;
  currency: Text; pricingBasis: PricingBasis; adultPrice: Text; childPrice: Text; discountPrice: Text; discountPercentage: Text;
  additionalFees: Text; additionalFeesBasis: FeeBasis; additionalFeesNote: Text;
  meals: Text; transportation: Text; entranceFees: Text; guideInfo: Text; specialRequirements: Text;
  accommodation: Text; accessibility: Text; safetyInstructions: Text; difficultyLevel: DifficultyLevel | ""; minAge: Text; maxAge: Text;
  videoUrl: Text;
  bookingPhone: Text; alternativePhone: Text; bookingEmail: Text; whatsappNumber: Text; maxGroupSize: Text; minParticipants: Text;
  bookingOpen: boolean; cancellationPolicy: Text; terms: Text;
  seoTitle: Text; seoDescription: Text;
  lists: TourLists;
}
type TextKey = { [K in keyof TourForm]: TourForm[K] extends string ? K : never }[keyof TourForm];

const emptyLists = (): TourLists => ({ included: [], excluded: [], highlight: [], activity: [], amenity: [], what_to_bring: [] });

const blankForm = (): TourForm => ({
  title: "", slug: "", shortDescription: "", description: "", categoryId: "", status: "draft", isFeatured: false, isPopular: false,
  operatorName: "Her Journey Tours and Travels", destination: "", country: "Rwanda", districtProvince: "", location: "", mapUrl: "",
  latitude: "", longitude: "", durationText: "", durationDays: "", departureTime: "", returnTime: "", pickupLocation: "", meetingPoint: "",
  currency: "RWF", pricingBasis: "per_person", adultPrice: "", childPrice: "", discountPrice: "", discountPercentage: "",
  additionalFees: "", additionalFeesBasis: "per_booking", additionalFeesNote: "", meals: "", transportation: "", entranceFees: "",
  guideInfo: "", specialRequirements: "", accommodation: "", accessibility: "", safetyInstructions: "", difficultyLevel: "",
  minAge: "", maxAge: "", videoUrl: "", bookingPhone: "", alternativePhone: "", bookingEmail: "", whatsappNumber: "",
  maxGroupSize: "", minParticipants: "", bookingOpen: true, cancellationPolicy: "", terms: "", seoTitle: "", seoDescription: "",
  lists: emptyLists(),
});

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const major = (v: number | null, currency: string) => (v === null ? "" : String(toMajor(v, currency)));

function fromTour(t: AdminTourDTO): TourForm {
  const c = t.pricing.currency;
  return {
    title: t.title, slug: t.slug, shortDescription: s(t.shortDescription), description: s(t.description), categoryId: s(t.categoryId),
    status: t.status, isFeatured: t.isFeatured, isPopular: t.isPopular, operatorName: t.operatorName,
    destination: t.destination, country: t.country, districtProvince: s(t.districtProvince), location: s(t.location), mapUrl: s(t.mapUrl),
    latitude: s(t.latitude), longitude: s(t.longitude), durationText: s(t.durationText), durationDays: s(t.durationDays),
    departureTime: s(t.departureTime), returnTime: s(t.returnTime), pickupLocation: s(t.pickupLocation), meetingPoint: s(t.meetingPoint),
    currency: c, pricingBasis: t.pricing.pricingBasis, adultPrice: major(t.pricing.adultPrice, c), childPrice: major(t.pricing.childPrice, c),
    discountPrice: major(t.pricing.discountPrice, c), discountPercentage: s(t.pricing.discountPercentage),
    additionalFees: t.pricing.additionalFees ? major(t.pricing.additionalFees, c) : "", additionalFeesBasis: t.pricing.additionalFeesBasis,
    additionalFeesNote: s(t.pricing.additionalFeesNote), meals: s(t.meals), transportation: s(t.transportation), entranceFees: s(t.entranceFees),
    guideInfo: s(t.guideInfo), specialRequirements: s(t.specialRequirements), accommodation: s(t.accommodation), accessibility: s(t.accessibility),
    safetyInstructions: s(t.safetyInstructions), difficultyLevel: t.difficultyLevel ?? "", minAge: s(t.minAge), maxAge: s(t.maxAge),
    videoUrl: s(t.videoUrl), bookingPhone: s(t.bookingPhone), alternativePhone: s(t.alternativePhone), bookingEmail: s(t.bookingEmail),
    whatsappNumber: s(t.whatsappNumber), maxGroupSize: s(t.maxGroupSize), minParticipants: s(t.minParticipants), bookingOpen: t.bookingOpen,
    cancellationPolicy: s(t.cancellationPolicy), terms: s(t.terms), seoTitle: s(t.seoTitle), seoDescription: s(t.seoDescription),
    lists: { ...emptyLists(), ...t.lists },
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const money = (v: string, currency: string) => (v.trim() === "" ? null : toMinor(Number(v), currency));

function toPayload(f: TourForm): TourUpsertInput {
  return {
    ...f,
    categoryId: num(f.categoryId),
    latitude: num(f.latitude),
    longitude: num(f.longitude),
    durationDays: num(f.durationDays),
    departureTime: f.departureTime || null,
    returnTime: f.returnTime || null,
    adultPrice: money(f.adultPrice, f.currency) ?? -1,
    childPrice: money(f.childPrice, f.currency),
    discountPrice: money(f.discountPrice, f.currency),
    discountPercentage: num(f.discountPercentage),
    additionalFees: money(f.additionalFees, f.currency) ?? 0,
    difficultyLevel: f.difficultyLevel || null,
    minAge: num(f.minAge),
    maxAge: num(f.maxAge),
    maxGroupSize: num(f.maxGroupSize),
    minParticipants: num(f.minParticipants),
  };
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// Which section each field lives in, so validation errors can flag the right tab.
const SECTIONS = [
  { id: "basics", label: "Basics", fields: ["title", "slug", "categoryId", "status", "shortDescription", "description", "operatorName"] },
  { id: "location", label: "Location", fields: ["destination", "country", "districtProvince", "location", "mapUrl", "latitude", "longitude"] },
  { id: "schedule", label: "Schedule & dates", fields: ["durationText", "durationDays", "departureTime", "returnTime", "pickupLocation", "meetingPoint"] },
  { id: "pricing", label: "Pricing", fields: ["currency", "pricingBasis", "adultPrice", "childPrice", "discountPrice", "discountPercentage", "additionalFees", "additionalFeesBasis", "additionalFeesNote"] },
  { id: "inclusions", label: "Inclusions", fields: ["lists.included", "lists.excluded", "lists.activity", "meals", "transportation", "entranceFees", "guideInfo", "specialRequirements"] },
  { id: "features", label: "Features", fields: ["lists.highlight", "lists.amenity", "lists.what_to_bring", "accommodation", "accessibility", "safetyInstructions", "difficultyLevel", "minAge", "maxAge"] },
  { id: "media", label: "Media", fields: ["videoUrl"] },
  { id: "booking", label: "Booking info", fields: ["bookingPhone", "alternativePhone", "bookingEmail", "whatsappNumber", "maxGroupSize", "minParticipants", "bookingOpen", "cancellationPolicy", "terms"] },
  { id: "seo", label: "SEO", fields: ["seoTitle", "seoDescription"] },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// ---------- page ----------

export function TourEditorPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const tourId = id ? Number(id) : null;
  const copyFrom = tourId === null ? Number(search.get("from")) || null : null;
  const sourceId = tourId ?? copyFrom;
  const tour = useQuery({
    queryKey: ["admin", "tour", sourceId],
    queryFn: () => api.get<AdminTourDTO>(`/api/admin/tours/${sourceId}`),
    enabled: sourceId !== null,
  });

  if (sourceId !== null && tour.isPending) return <PageLoader />;
  if (tour.isError) return <ErrorState message={errorMessage(tour.error)} onRetry={() => tour.refetch()} />;

  let initial = blankForm();
  if (tour.data) {
    initial = fromTour(tour.data);
    if (copyFrom) {
      initial = { ...initial, title: `${initial.title} (copy)`, slug: `${initial.slug}-copy`, status: "draft", isFeatured: false };
    }
  }
  // Re-mount the editor when switching tours so the form starts from fresh data.
  return <TourEditor key={sourceId ?? "new"} tourId={tourId} copyFrom={copyFrom} initial={initial} savedTour={tourId !== null ? tour.data : undefined} />;
}

function TourEditor({ tourId, copyFrom, initial, savedTour }: { tourId: number | null; copyFrom: number | null; initial: TourForm; savedTour: AdminTourDTO | undefined }) {
  const isNew = tourId === null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const canWrite = can("tours:write");

  const [form, setForm] = useState<TourForm>(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [section, setSection] = useState<SectionId>("basics");
  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api.get<{ items: CategoryDTO[] }>("/api/admin/categories"),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form);
      return isNew ? api.post<AdminTourDTO>("/api/admin/tours", payload) : api.put<AdminTourDTO>(`/api/admin/tours/${tourId}`, payload);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "tour", saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ["admin", "tours"] });
      queryClient.invalidateQueries({ queryKey: ["public"] });
      toast(isNew ? "Tour created. You can now add departures and images." : "Tour saved");
      if (isNew) {
        navigate(`/admin/tours/${saved.id}`, { replace: true });
      } else {
        setForm(fromTour(saved));
      }
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/admin/tours/${tourId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tours"] });
      toast("Tour deleted");
      navigate("/admin/tours", { replace: true });
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const archive = useMutation({
    mutationFn: () => api.patch<AdminTourDTO>(`/api/admin/tours/${tourId}`, { status: "archived" }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin", "tour", saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ["admin", "tours"] });
      setForm((f) => ({ ...f, status: "archived" }));
      toast("Tour archived");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  const errors = fieldErrors(save.error);
  const sectionHasError = (sid: SectionId) =>
    (SECTIONS.find((x) => x.id === sid)?.fields as readonly string[]).some((f) => Object.keys(errors).some((e) => e === f || e.startsWith(`${f}.`)));

  const preview = useMemo(() => {
    const adult = money(form.adultPrice, form.currency);
    if (adult === null || Number.isNaN(adult)) return null;
    return calculateQuote(
      {
        currency: form.currency,
        pricingBasis: form.pricingBasis,
        adultPrice: adult,
        childPrice: money(form.childPrice, form.currency),
        discountPrice: money(form.discountPrice, form.currency),
        discountPercentage: num(form.discountPercentage),
        additionalFees: money(form.additionalFees, form.currency) ?? 0,
        additionalFeesBasis: form.additionalFeesBasis,
      },
      2,
      1,
    );
  }, [form.adultPrice, form.childPrice, form.discountPrice, form.discountPercentage, form.additionalFees, form.additionalFeesBasis, form.currency, form.pricingBasis]);

  const set = <K extends keyof TourForm>(key: K, value: TourForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: TextKey, label: string, opts: { required?: boolean; hint?: ReactNode; type?: string; placeholder?: string; className?: string; rows?: number; max?: number } = {}) => (
    <Field label={label} required={opts.required} error={errors[key]} hint={opts.hint} className={opts.className}>
      {(p) =>
        opts.rows ? (
          <Textarea {...p} rows={opts.rows} value={form[key]} onChange={(e) => set(key, e.target.value)} maxLength={opts.max} placeholder={opts.placeholder} disabled={!canWrite} />
        ) : (
          <Input {...p} type={opts.type ?? "text"} value={form[key]} onChange={(e) => set(key, e.target.value)} maxLength={opts.max} placeholder={opts.placeholder} disabled={!canWrite} step={opts.type === "number" ? "any" : undefined} />
        )
      }
    </Field>
  );
  const list = (kind: keyof TourLists, label: string, hint?: string) => (
    <div>
      <ListEditor label={label} hint={hint} items={form.lists[kind]} onChange={(items) => set("lists", { ...form.lists, [kind]: items })} />
      {errors[`lists.${kind}`] && <p className="mt-1 text-xs text-danger-600">{errors[`lists.${kind}`]}</p>}
    </div>
  );
  const cur = form.currency;

  return (
    <>
      <PageHeader
        back={{ to: "/admin/tours", label: "All tours" }}
        title={isNew ? (copyFrom ? "Duplicate tour" : "New tour") : form.title || "Edit tour"}
        description={
          savedTour ? (
            <span className="flex items-center gap-2"><TourStatusBadge status={savedTour.status} /> {savedTour.bookingCount} booking{savedTour.bookingCount === 1 ? "" : "s"} · last updated {new Date(savedTour.updatedAt).toLocaleString()}</span>
          ) : (
            "Fill in the essentials first. You can add dates and images after saving."
          )
        }
        actions={
          <>
            {savedTour?.status === "published" && (
              <a href={`/tours/${savedTour.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-forest-700 ring-1 ring-line hover:bg-forest-50">
                <ExternalLink className="size-4" /> View
              </a>
            )}
            {savedTour && canWrite && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Trash2 className="size-4 text-danger-600" />}
                onClick={() => confirm(savedTour.bookingCount ? "This tour has bookings, so it will be archived (hidden from the website) instead of deleted. Continue?" : "Delete this tour permanently?") && (savedTour.bookingCount ? archive.mutate() : remove.mutate())}
              >
                {savedTour.bookingCount ? "Archive" : "Delete"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-8 lg:flex-col lg:self-start" aria-label="Tour sections">
          {SECTIONS.map((x) => (
            <button
              key={x.id}
              onClick={() => setSection(x.id)}
              className={cn(
                "flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium",
                section === x.id ? "bg-forest-700 text-white" : "text-forest-800 hover:bg-white",
              )}
              aria-current={section === x.id ? "step" : undefined}
            >
              {x.label}
              {sectionHasError(x.id) && <AlertCircle className={cn("size-4", section === x.id ? "text-sun-300" : "text-danger-600")} />}
            </button>
          ))}
        </nav>

        <form
          className="min-w-0 space-y-6 pb-24"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.isError && Object.keys(errors).length > 0 && (
            <FormError message={`Please fix the highlighted fields in: ${SECTIONS.filter((x) => sectionHasError(x.id)).map((x) => x.label).join(", ")}.`} />
          )}

          {section === "basics" && (
            <Panel title="Basic information">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Tour title" required error={errors.title} className="sm:col-span-2">
                  {(p) => (
                    <Input
                      {...p}
                      value={form.title}
                      maxLength={160}
                      disabled={!canWrite}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))}
                    />
                  )}
                </Field>
                <Field label="URL slug" required error={errors.slug} hint={`Public address: /tours/${form.slug || "your-tour"}`} className="sm:col-span-2">
                  {(p) => (
                    <Input
                      {...p}
                      value={form.slug}
                      disabled={!canWrite}
                      onChange={(e) => {
                        setSlugTouched(true);
                        set("slug", slugify(e.target.value) + (e.target.value.endsWith("-") ? "-" : ""));
                      }}
                    />
                  )}
                </Field>
                <Field label="Category" error={errors.categoryId}>
                  {(p) => (
                    <Select {...p} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} disabled={!canWrite}>
                      <option value="">No category</option>
                      {categories.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Status" error={errors.status} hint="Only published tours appear on the website.">
                  {(p) => (
                    <Select {...p} value={form.status} onChange={(e) => set("status", e.target.value as TourStatus)} disabled={!canWrite}>
                      {TOUR_STATUSES.map((st) => <option key={st} value={st}>{TOUR_STATUS_LABELS[st]}</option>)}
                    </Select>
                  )}
                </Field>
                <div className="flex flex-wrap gap-6 sm:col-span-2">
                  <Checkbox label="Featured" description="Highlighted on the homepage" checked={form.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} disabled={!canWrite} />
                  <Checkbox label="Popular" description="Shows a Popular badge" checked={form.isPopular} onChange={(e) => set("isPopular", e.target.checked)} disabled={!canWrite} />
                </div>
                {text("operatorName", "Tour operator", { required: true, className: "sm:col-span-2" })}
                {text("shortDescription", "Short description", { rows: 2, max: 400, className: "sm:col-span-2", hint: `${form.shortDescription.length}/400 · shown on tour cards` })}
                {text("description", "Full description", { rows: 10, max: 20000, className: "sm:col-span-2", hint: "Separate paragraphs with a blank line." })}
              </div>
            </Panel>
          )}

          {section === "location" && (
            <Panel title="Location">
              <div className="grid gap-5 sm:grid-cols-2">
                {text("destination", "Destination", { required: true, placeholder: "e.g. Eagle View Farm, Bugesera" })}
                {text("country", "Country", { required: true })}
                {text("districtProvince", "District / province")}
                {text("location", "Specific location")}
                {text("mapUrl", "Google Maps link", { className: "sm:col-span-2", placeholder: "https://maps.app.goo.gl/…", hint: "Paste a share link from Google Maps." })}
                {text("latitude", "Latitude", { type: "number", hint: "Optional, for an exact map pin" })}
                {text("longitude", "Longitude", { type: "number" })}
              </div>
            </Panel>
          )}

          {section === "schedule" && (
            <>
              <Panel title="Default schedule" description="Used for every departure unless a departure overrides it.">
                <div className="grid gap-5 sm:grid-cols-2">
                  {text("durationText", "Duration", { placeholder: "e.g. Full day, 2 days / 1 night" })}
                  {text("durationDays", "Duration in days", { type: "number" })}
                  {text("departureTime", "Departure time", { type: "time" })}
                  {text("returnTime", "Return time", { type: "time" })}
                  {text("pickupLocation", "Pickup location")}
                  {text("meetingPoint", "Meeting point")}
                </div>
              </Panel>
              <Panel title="Departure dates" description="Start/end dates, seats, booking deadlines and per-date pricing.">
                {savedTour ? (
                  <DepartureManager
                    tourId={savedTour.id}
                    departures={savedTour.departures}
                    currency={savedTour.pricing.currency}
                    defaults={{ departureTime: savedTour.departureTime, returnTime: savedTour.returnTime }}
                    canWrite={canWrite}
                  />
                ) : (
                  <p className="text-sm text-muted">Save the tour first, then add departure dates here.</p>
                )}
              </Panel>
            </>
          )}

          {section === "pricing" && (
            <Panel title="Pricing" description="Amounts are entered in the selected currency.">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Currency" required error={errors.currency}>
                  {(p) => (
                    <Select {...p} value={form.currency} onChange={(e) => set("currency", e.target.value)} disabled={!canWrite}>
                      {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].label}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Pricing basis" required error={errors.pricingBasis}>
                  {(p) => (
                    <Select {...p} value={form.pricingBasis} onChange={(e) => set("pricingBasis", e.target.value as PricingBasis)} disabled={!canWrite}>
                      {PRICING_BASES.map((b) => <option key={b} value={b}>{b === "per_person" ? "Per person" : "Per group (one price)"}</option>)}
                    </Select>
                  )}
                </Field>
                {text("adultPrice", form.pricingBasis === "per_group" ? `Group price (${cur})` : `Adult price (${cur})`, { required: true, type: "number" })}
                {text("childPrice", `Child price (${cur})`, { type: "number", hint: "Leave empty to charge children the adult price." })}
                {text("discountPrice", `Discounted adult price (${cur})`, { type: "number", hint: "Optional offer price, lower than the adult price." })}
                {text("discountPercentage", "Discount percentage", { type: "number", hint: "Applied when no discounted price is set (also to child price)." })}
                {text("additionalFees", `Additional fees (${cur})`, { type: "number" })}
                <Field label="Fees charged" error={errors.additionalFeesBasis}>
                  {(p) => (
                    <Select {...p} value={form.additionalFeesBasis} onChange={(e) => set("additionalFeesBasis", e.target.value as FeeBasis)} disabled={!canWrite}>
                      {FEE_BASES.map((b) => <option key={b} value={b}>{b === "per_booking" ? "Once per booking" : "Per person"}</option>)}
                    </Select>
                  )}
                </Field>
                {text("additionalFeesNote", "What the fees cover", { className: "sm:col-span-2" })}
              </div>
              {preview && (
                <div className="mt-6 rounded-xl bg-ivory p-4 text-sm">
                  <p className="font-semibold text-forest-900">Price check: 2 adults + 1 child</p>
                  <ul className="mt-2 space-y-1 text-muted">
                    {preview.lines.map((l) => <li key={l.label}>{l.label} × {l.quantity}: {formatMoney(l.amount, cur)}</li>)}
                  </ul>
                  <p className="mt-2 font-semibold text-forest-900">Total {formatMoney(preview.totalAmount, cur)}{preview.discountAmount > 0 && ` (saves ${formatMoney(preview.discountAmount, cur)})`}</p>
                </div>
              )}
            </Panel>
          )}

          {section === "inclusions" && (
            <Panel title="Inclusions">
              <div className="grid gap-6 md:grid-cols-2">
                {list("included", "Included services")}
                {list("excluded", "Excluded services")}
                {list("activity", "Activities")}
                <div className="space-y-5">
                  {text("meals", "Meals", { placeholder: "e.g. Lunch at Yellow Elephant Coffee" })}
                  {text("transportation", "Transportation")}
                  {text("entranceFees", "Entrance fees")}
                  {text("guideInfo", "Tour guide information")}
                </div>
                {text("specialRequirements", "Special requirements", { rows: 3, className: "md:col-span-2" })}
              </div>
            </Panel>
          )}

          {section === "features" && (
            <Panel title="Features & practical information">
              <div className="grid gap-6 md:grid-cols-2">
                {list("highlight", "Tour highlights")}
                {list("amenity", "Amenities")}
                {list("what_to_bring", "What to bring")}
                <div className="space-y-5">
                  <Field label="Difficulty level" error={errors.difficultyLevel}>
                    {(p) => (
                      <Select {...p} value={form.difficultyLevel} onChange={(e) => set("difficultyLevel", e.target.value as DifficultyLevel | "")} disabled={!canWrite}>
                        <option value="">Not specified</option>
                        {DIFFICULTY_LEVELS.map((d) => <option key={d} value={d}>{d[0]!.toUpperCase() + d.slice(1)}</option>)}
                      </Select>
                    )}
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    {text("minAge", "Minimum age", { type: "number" })}
                    {text("maxAge", "Maximum age", { type: "number" })}
                  </div>
                </div>
                {text("accommodation", "Accommodation details", { rows: 3 })}
                {text("accessibility", "Accessibility information", { rows: 3 })}
                {text("safetyInstructions", "Safety instructions", { rows: 4, className: "md:col-span-2" })}
              </div>
            </Panel>
          )}

          {section === "media" && (
            <>
              <Panel title="Images">
                {savedTour ? (
                  <ImageManager tourId={savedTour.id} images={savedTour.images} canWrite={canWrite} tourTitle={savedTour.title} />
                ) : (
                  <p className="text-sm text-muted">Save the tour first, then upload a cover, gallery images and a poster here.</p>
                )}
              </Panel>
              <Panel title="Video">
                {text("videoUrl", "Video URL", { placeholder: "https://www.youtube.com/watch?v=…", hint: "YouTube and Vimeo links are embedded on the tour page." })}
              </Panel>
            </>
          )}

          {section === "booking" && (
            <Panel title="Booking information" description="Contact details fall back to the site settings when left empty.">
              <div className="grid gap-5 sm:grid-cols-2">
                {text("bookingPhone", "Booking phone", { type: "tel" })}
                {text("alternativePhone", "Alternative phone", { type: "tel" })}
                {text("bookingEmail", "Booking email", { type: "email" })}
                {text("whatsappNumber", "WhatsApp number", { type: "tel" })}
                {text("maxGroupSize", "Maximum guests per booking", { type: "number" })}
                {text("minParticipants", "Minimum participants", { type: "number", hint: "Shown to customers for information." })}
                <div className="sm:col-span-2">
                  <Checkbox label="Accept online bookings" description="Untick to show the tour without allowing new bookings." checked={form.bookingOpen} onChange={(e) => set("bookingOpen", e.target.checked)} disabled={!canWrite} />
                </div>
                {text("cancellationPolicy", "Cancellation policy", { rows: 4, className: "sm:col-span-2" })}
                {text("terms", "Terms & conditions", { rows: 4, className: "sm:col-span-2" })}
              </div>
            </Panel>
          )}

          {section === "seo" && (
            <Panel title="Search engine optimisation">
              <div className="space-y-5">
                {text("seoTitle", "SEO title", { max: 70, hint: `${form.seoTitle.length}/70 · defaults to the tour title` })}
                {text("seoDescription", "Meta description", { rows: 3, max: 170, hint: `${form.seoDescription.length}/170 · defaults to the short description` })}
                <div className="rounded-xl bg-ivory p-4">
                  <p className="text-xs font-semibold text-muted uppercase">Search preview</p>
                  <p className="mt-2 truncate text-lg text-[#1a0dab]">{form.seoTitle || `${form.title || "Tour title"} | Her Journey Tours and Travels`}</p>
                  <p className="text-xs text-forest-700">/tours/{form.slug || "your-tour"}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{form.seoDescription || form.shortDescription || "Add a description to show here."}</p>
                </div>
              </div>
            </Panel>
          )}

          {canWrite && (
            <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-5 py-3 shadow-lift ring-1 ring-line backdrop-blur">
              <p className="text-xs text-muted">{isNew ? "Required: title, slug, destination, country and adult price." : "Changes apply to the website as soon as you save."}</p>
              <Button type="submit" loading={save.isPending} icon={<Save className="size-4" />}>
                {isNew ? "Create tour" : "Save changes"}
              </Button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
