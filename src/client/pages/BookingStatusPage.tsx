import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, Hourglass, MapPin, MessageCircle, Phone, Printer, Smartphone, XCircle } from "lucide-react";
import type { PublicBookingDTO } from "@shared/types";
import { PAYMENT_METHOD_LABELS } from "@shared/constants";
import { formatMoney, toMajor, toMinor } from "@shared/money";
import { businessToday, formatDate, formatDateTime, formatTime } from "@shared/time";
import { api, ApiError, errorMessage, fieldErrors } from "@client/lib/api";
import { useDocumentMeta } from "@client/lib/useDocumentMeta";
import { formatPhone, telHref, whatsappHref } from "@client/lib/contact";
import { cn } from "@client/lib/cn";
import { BookingStatusBadge, PaymentStatusBadge } from "@client/components/ui/Badge";
import { Button, ButtonLink } from "@client/components/ui/Button";
import { CopyButton } from "@client/components/ui/Copy";
import { Field, FormError, Input } from "@client/components/ui/Field";
import { EmptyState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function StatusBanner({ booking }: { booking: PublicBookingDTO }) {
  const remaining = useCountdown(booking.status === "pending_payment" ? booking.expiresAt : null);
  const config = {
    pending_payment: {
      icon: Hourglass,
      tone: "bg-sun-50 ring-sun-300 text-sun-700",
      title: "Seats reserved, awaiting payment",
      text: booking.expiresAt
        ? `Pay within ${remaining ?? ""} (before ${formatDateTime(booking.expiresAt)}) to keep your seats.`
        : "Complete your payment to secure your seats.",
    },
    payment_submitted: {
      icon: Clock,
      tone: "bg-info-50 ring-info-600/30 text-info-600",
      title: "Payment submitted, we're verifying it",
      text: "Our team checks every MoMo payment by hand. You'll see your booking confirmed here shortly.",
    },
    confirmed: {
      icon: CheckCircle2,
      tone: "bg-forest-50 ring-forest-300 text-forest-700",
      title: "Your booking is confirmed",
      text: "Thank you! We've verified your payment. We look forward to travelling with you.",
    },
    cancelled: { icon: XCircle, tone: "bg-danger-50 ring-danger-600/30 text-danger-700", title: "This booking was cancelled", text: "Please contact us if you have any questions." },
    expired: {
      icon: XCircle,
      tone: "bg-stone-100 ring-stone-300 text-stone-700",
      title: "This booking has expired",
      text: "We didn't receive a payment in time, so the seats were released. If you already paid, submit your transaction ID below or contact us.",
    },
    refunded: { icon: CheckCircle2, tone: "bg-sage-100 ring-sage-300 text-sage-700", title: "This booking was refunded", text: "Your payment has been refunded." },
  }[booking.status];
  const Icon = config.icon;
  return (
    <div className={cn("flex items-start gap-4 rounded-3xl p-5 ring-1 sm:p-6", config.tone)} role="status">
      <Icon className="mt-0.5 size-6 shrink-0" />
      <div>
        <p className="font-semibold">{config.title}</p>
        <p className="mt-1 text-sm opacity-90">{config.text}</p>
      </div>
    </div>
  );
}

function PaymentForm({ booking, credential, onDone }: { booking: PublicBookingDTO; credential: { token?: string; email?: string }; onDone: (b: PublicBookingDTO) => void }) {
  const due = booking.paymentInstructions.amountDue;
  const [form, setForm] = useState({
    transactionReference: "",
    payerPhone: booking.customerPhone,
    amount: String(toMajor(due, booking.currency)),
    paidAt: businessToday(),
  });
  const submit = useMutation({
    mutationFn: () =>
      api.post<PublicBookingDTO>(`/api/public/bookings/${booking.reference}/payments`, {
        ...credential,
        transactionReference: form.transactionReference.trim(),
        payerPhone: form.payerPhone,
        amount: toMinor(Number(form.amount), booking.currency),
        paidAt: form.paidAt,
      }),
    onSuccess: onDone,
  });
  const errors = fieldErrors(submit.error);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <Field label="MoMo transaction ID" required error={errors.transactionReference} hint="Find it in the confirmation SMS from MTN MoMo.">
        {(p) => <Input {...p} value={form.transactionReference} onChange={(e) => setForm({ ...form, transactionReference: e.target.value })} placeholder="e.g. 12345678901" autoComplete="off" required />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number you paid from" required error={errors.payerPhone}>
          {(p) => <Input {...p} type="tel" inputMode="tel" value={form.payerPhone} onChange={(e) => setForm({ ...form, payerPhone: e.target.value })} required />}
        </Field>
        <Field label={`Amount paid (${booking.currency})`} required error={errors.amount}>
          {(p) => <Input {...p} type="number" inputMode="decimal" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />}
        </Field>
      </div>
      <Field label="Payment date" required error={errors.paidAt}>
        {(p) => <Input {...p} type="date" max={businessToday()} value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} required />}
      </Field>
      <FormError message={submit.isError && !Object.keys(errors).length ? errorMessage(submit.error) : null} />
      <Button type="submit" size="lg" className="w-full" loading={submit.isPending}>
        Submit payment details
      </Button>
      <p className="text-center text-xs text-muted">Submitting your transaction ID does not confirm the booking by itself. We confirm it after verifying the payment.</p>
    </form>
  );
}

export function BookingStatusPage() {
  const { reference = "" } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const token = params.get("t") ?? undefined;
  const email = (location.state as { email?: string } | null)?.email;
  const credential = token ? { token } : email ? { email } : null;
  useDocumentMeta(`Booking ${reference} | Her Journey Tours and Travels`);

  const key = ["public", "booking", reference];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.post<PublicBookingDTO>(`/api/public/bookings/${encodeURIComponent(reference)}/view`, credential ?? {}),
    enabled: Boolean(credential),
    refetchInterval: (q) => (q.state.data?.status === "payment_submitted" ? 60_000 : false),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  if (!credential) {
    return (
      <div className="container-page py-24">
        <EmptyState title="Find your booking" action={<ButtonLink to="/booking/lookup">Look up a booking</ButtonLink>}>
          Enter your booking reference and email address to see your booking.
        </EmptyState>
      </div>
    );
  }
  if (query.isPending) return <PageLoader label="Loading your booking" />;
  if (query.isError) {
    return (
      <div className="container-page py-24">
        <EmptyState title="We couldn't find that booking" action={<ButtonLink to="/booking/lookup">Try looking it up</ButtonLink>}>
          {errorMessage(query.error)}
        </EmptyState>
      </div>
    );
  }
  const b = query.data;
  const p = b.paymentInstructions;
  const awaitingReview = b.payments.some((x) => x.status === "submitted");

  return (
    <div className="container-page py-10 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Booking reference</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-3xl font-semibold tracking-wider sm:text-4xl">{b.reference}</h1>
            <CopyButton value={b.reference} />
            <BookingStatusBadge status={b.status} />
          </div>
          <p className="mt-2 text-sm text-muted">Save this page or your reference. You can always find your booking with your reference and email.</p>
        </div>
        <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()} className="print:hidden">
          Print
        </Button>
      </div>

      <div className="mt-8"><StatusBanner booking={b} /></div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          {b.canSubmitPayment && (
            <section className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line/60">
              <div className="bg-forest-700 p-6 text-white sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl bg-sun-400 p-2.5 text-forest-950"><Smartphone className="size-6" /></span>
                  <div>
                    <h2 className="font-sans text-lg font-semibold text-white">Pay with MoMo Pay</h2>
                    <p className="text-sm text-forest-100">{p.merchantName}</p>
                  </div>
                </div>
                <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/10 p-4">
                    <dt className="text-xs text-forest-200">MoMo Pay code</dt>
                    <dd className="mt-1 flex items-center justify-between gap-2 font-mono text-2xl font-semibold tracking-widest text-sun-300">
                      {p.momoPayCode}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    <dt className="text-xs text-forest-200">Amount payable</dt>
                    <dd className="mt-1 text-2xl font-semibold">{formatMoney(p.amountDue, p.currency)}</dd>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    <dt className="text-xs text-forest-200">Reference</dt>
                    <dd className="mt-1 font-mono text-2xl font-semibold tracking-wider">{b.reference}</dd>
                  </div>
                </dl>
                {p.deadline && b.status === "pending_payment" && (
                  <p className="mt-4 text-sm text-forest-100">Payment deadline: <strong className="text-white">{formatDateTime(p.deadline)}</strong></p>
                )}
              </div>
              <div className="p-6 sm:p-8">
                <h3 className="font-sans text-base font-semibold text-forest-900">How to pay</h3>
                <ol className="mt-4 space-y-3">
                  {p.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-forest-50 text-xs font-bold text-forest-700">{i + 1}</span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-6 flex flex-wrap gap-2">
                  <CopyButton value={p.momoPayCode} label="Copy code" />
                  <CopyButton value={String(toMajor(p.amountDue, p.currency))} label="Copy amount" />
                </div>

                <div className="mt-8 border-t border-line pt-8">
                  <h3 className="font-sans text-base font-semibold text-forest-900">{awaitingReview ? "Submit another payment" : "Already paid? Submit your payment details"}</h3>
                  <div className="mt-4">
                    <PaymentForm booking={b} credential={credential} onDone={(fresh) => queryClient.setQueryData(key, fresh)} />
                  </div>
                </div>
              </div>
            </section>
          )}

          {b.payments.length > 0 && (
            <section className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60 sm:p-8">
              <h2 className="font-sans text-lg font-semibold text-forest-900">Payments</h2>
              <ul className="mt-4 divide-y divide-line">
                {b.payments.map((pay) => (
                  <li key={pay.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-semibold text-forest-900">{formatMoney(pay.amount, pay.currency)} · {PAYMENT_METHOD_LABELS[pay.method]}</p>
                      <p className="text-xs text-muted">
                        {pay.transactionReference && <>Transaction {pay.transactionReference} · </>}
                        {pay.submittedAt ? `Submitted ${formatDateTime(pay.submittedAt)}` : ""}
                      </p>
                      {pay.status === "rejected" && pay.rejectionReason && <p className="mt-1 text-xs text-danger-600">Reason: {pay.rejectionReason}</p>}
                    </div>
                    <PaymentStatusBadge status={pay.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-line/60">
            <h2 className="font-sans text-lg font-semibold text-forest-900">
              <Link to={`/tours/${b.tour.slug}`} className="hover:underline">{b.tour.title}</Link>
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2"><CalendarDays className="size-4 text-sage-500" />{formatDate(b.departure.startDate, true)}</li>
              {b.departure.departureTime && (
                <li className="flex items-center gap-2"><Clock className="size-4 text-sage-500" />Departs {formatTime(b.departure.departureTime)}{b.departure.returnTime && `, returns ${formatTime(b.departure.returnTime)}`}</li>
              )}
              {b.tour.pickupLocation && <li className="flex items-center gap-2"><MapPin className="size-4 text-sage-500" />Pickup: {b.tour.pickupLocation}</li>}
              {b.tour.meetingPoint && <li className="flex items-center gap-2"><MapPin className="size-4 text-sage-500" />Meet at: {b.tour.meetingPoint}</li>}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Lead guest</dt><dd className="font-medium">{b.customerName}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Guests</dt><dd className="font-medium">{b.adults} adult{b.adults === 1 ? "" : "s"}{b.children ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}</dd></div>
              {b.adults > 0 && <div className="flex justify-between"><dt className="text-muted">Adult price</dt><dd>{formatMoney(b.adultUnitPrice, b.currency)}</dd></div>}
              {b.children > 0 && <div className="flex justify-between"><dt className="text-muted">Child price</dt><dd>{formatMoney(b.childUnitPrice, b.currency)}</dd></div>}
              {b.feesAmount > 0 && <div className="flex justify-between"><dt className="text-muted">Fees</dt><dd>{formatMoney(b.feesAmount, b.currency)}</dd></div>}
              {b.discountAmount > 0 && <div className="flex justify-between text-forest-700"><dt>Discount</dt><dd>− {formatMoney(b.discountAmount, b.currency)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-3 text-base"><dt className="font-semibold">Total</dt><dd className="font-semibold">{formatMoney(b.totalAmount, b.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Verified paid</dt><dd className="font-medium text-forest-700">{formatMoney(b.amountPaid, b.currency)}</dd></div>
            </dl>
            {b.specialRequests && <p className="mt-4 rounded-2xl bg-ivory p-3 text-xs text-muted">Your request: {b.specialRequests}</p>}
          </section>

          <section className="rounded-3xl bg-forest-50 p-6 ring-1 ring-forest-100">
            <h2 className="font-sans text-base font-semibold text-forest-900">Need help with your booking?</h2>
            <div className="mt-3 space-y-1.5 text-sm">
              {b.contact.phone && <a href={telHref(b.contact.phone)} className="flex items-center gap-2 py-1 hover:underline"><Phone className="size-4 text-forest-600" />{formatPhone(b.contact.phone)}</a>}
              {b.contact.altPhone && <a href={telHref(b.contact.altPhone)} className="flex items-center gap-2 py-1 hover:underline"><Phone className="size-4 text-forest-600" />{formatPhone(b.contact.altPhone)}</a>}
              {b.contact.whatsapp && (
                <a href={whatsappHref(b.contact.whatsapp, `Hello, this is about booking ${b.reference}.`)} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1 hover:underline">
                  <MessageCircle className="size-4 text-forest-600" />WhatsApp us about {b.reference}
                </a>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
