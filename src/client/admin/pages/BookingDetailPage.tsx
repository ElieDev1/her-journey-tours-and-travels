import { useState } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, MessageCircle, Phone, PlusCircle, XCircle } from "lucide-react";
import type { AdminBookingDetailDTO } from "@shared/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@shared/constants";
import { formatMoney, toMajor, toMinor } from "@shared/money";
import { businessToday, formatDate, formatDateTime, formatTime } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { telHref, whatsappHref } from "@client/lib/contact";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input, Select, Textarea } from "@client/components/ui/Field";
import { BookingStatusBadge, PaymentStatusBadge } from "@client/components/ui/Badge";
import { Modal } from "@client/components/ui/Modal";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Panel } from "../components/PageHeader";
import { PaymentActions } from "../components/PaymentActions";
import { useCan } from "../session";

const ACTION_LABELS: Record<string, string> = {
  "booking.confirm": "Booking confirmed",
  "booking.cancel": "Booking cancelled",
  "booking.notes": "Notes updated",
  "payment.verify": "Payment verified",
  "payment.reject": "Payment rejected",
  "payment.refund": "Refund recorded",
  "payment.record": "Payment recorded manually",
};

export function BookingDetailPage() {
  const { id = "" } = useParams();
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["admin", "booking", id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<AdminBookingDetailDTO>(`/api/admin/bookings/${id}`) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ method: "momo_pay" as PaymentMethod, amount: "", transactionReference: "", payerPhone: "", paidAt: businessToday(), notes: "" });

  const onBooking = (b: AdminBookingDetailDTO) => {
    queryClient.setQueryData(key, b);
    queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
  };
  const confirmBooking = useMutation({
    mutationFn: () => api.post<AdminBookingDetailDTO>(`/api/admin/bookings/${id}/confirm`),
    onSuccess: (b) => { onBooking(b); toast("Booking confirmed"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const cancel = useMutation({
    mutationFn: () => api.post<AdminBookingDetailDTO>(`/api/admin/bookings/${id}/cancel`, { reason }),
    onSuccess: (b) => { onBooking(b); setCancelOpen(false); toast("Booking cancelled and seats released"); },
  });
  const saveNotes = useMutation({
    mutationFn: () => api.patch<AdminBookingDetailDTO>(`/api/admin/bookings/${id}/notes`, { adminNotes: notes }),
    onSuccess: (b) => { onBooking(b); setNotes(null); toast("Notes saved"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  const record = useMutation({
    mutationFn: () =>
      api.post<AdminBookingDetailDTO>(`/api/admin/bookings/${id}/payments`, {
        method: manual.method,
        amount: toMinor(Number(manual.amount), q.data?.currency ?? "RWF"),
        transactionReference: manual.transactionReference || null,
        payerPhone: manual.payerPhone || null,
        paidAt: manual.paidAt,
        notes: manual.notes || null,
      }),
    onSuccess: (b) => { onBooking(b); setManualOpen(false); toast("Payment recorded. Verify it to confirm the booking."); },
  });

  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const b = q.data;
  const balance = Math.max(b.totalAmount - b.amountVerified, 0);
  const canConfirm = can("bookings:write") && ["pending_payment", "payment_submitted", "expired"].includes(b.status);
  const canCancel = can("bookings:write") && ["pending_payment", "payment_submitted", "confirmed", "expired"].includes(b.status);
  const recordErrors = fieldErrors(record.error);

  return (
    <>
      <PageHeader
        back={{ to: "/admin/bookings", label: "All bookings" }}
        title={`Booking ${b.reference}`}
        description={<span className="flex items-center gap-2"><BookingStatusBadge status={b.status} /> Created {formatDateTime(b.createdAt)}</span>}
        actions={
          <>
            {canConfirm && (
              <Button
                icon={<CheckCircle2 className="size-4" />}
                loading={confirmBooking.isPending}
                onClick={() => confirm(balance > 0 ? `The verified payments (${formatMoney(b.amountVerified, b.currency)}) do not cover the total. Confirm anyway?` : "Confirm this booking?") && confirmBooking.mutate()}
              >
                Confirm booking
              </Button>
            )}
            {canCancel && <Button variant="secondary" icon={<XCircle className="size-4 text-danger-600" />} onClick={() => { cancel.reset(); setReason(""); setCancelOpen(true); }}>Cancel booking</Button>}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Panel title="Trip">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div className="sm:col-span-3"><dt className="text-xs text-muted">Tour</dt><dd className="font-semibold">{b.tourTitle}</dd></div>
              <div><dt className="text-xs text-muted">Departure</dt><dd className="font-medium">{formatDate(b.departureDate, true)}</dd></div>
              <div><dt className="text-xs text-muted">Time</dt><dd>{formatTime(b.departure.departureTime) ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Seats on departure</dt><dd>{b.departure.seatsReserved} held{b.departure.seatCapacity !== null ? ` / ${b.departure.seatCapacity}` : ""}</dd></div>
              <div><dt className="text-xs text-muted">Guests</dt><dd className="font-medium">{b.adults} adult{b.adults === 1 ? "" : "s"}, {b.children} child{b.children === 1 ? "" : "ren"}</dd></div>
              <div><dt className="text-xs text-muted">Seats held by this booking</dt><dd>{b.seatsHeld ? `Yes (${b.totalGuests})` : "No"}</dd></div>
              {b.expiresAt && b.status === "pending_payment" && <div><dt className="text-xs text-muted">Payment deadline</dt><dd>{formatDateTime(b.expiresAt)}</dd></div>}
              {b.confirmedAt && <div><dt className="text-xs text-muted">Confirmed</dt><dd>{formatDateTime(b.confirmedAt)}</dd></div>}
              {b.cancelledAt && <div><dt className="text-xs text-muted">Cancelled</dt><dd>{formatDateTime(b.cancelledAt)}</dd></div>}
              {b.cancellationReason && <div className="sm:col-span-3"><dt className="text-xs text-muted">Cancellation reason</dt><dd>{b.cancellationReason}</dd></div>}
            </dl>
            {b.specialRequests && <p className="mt-5 rounded-xl bg-sun-50 p-4 text-sm"><span className="font-semibold">Special requests: </span>{b.specialRequests}</p>}
          </Panel>

          <Panel
            title="Payments"
            description={`Total ${formatMoney(b.totalAmount, b.currency)} · verified ${formatMoney(b.amountVerified, b.currency)} · balance ${formatMoney(balance, b.currency)}`}
            actions={can("payments:verify") && !["cancelled", "refunded"].includes(b.status) && (
              <Button size="sm" variant="secondary" icon={<PlusCircle className="size-4" />} onClick={() => { record.reset(); setManual((m) => ({ ...m, amount: String(toMajor(balance, b.currency)), payerPhone: b.customerPhone })); setManualOpen(true); }}>
                Record payment
              </Button>
            )}
          >
            {b.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="space-y-3">
                {b.payments.map((p) => (
                  <li key={p.id} className="rounded-xl p-4 ring-1 ring-line">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{formatMoney(p.amount, p.currency)} <span className="font-normal text-muted">· {PAYMENT_METHOD_LABELS[p.method]}</span></p>
                        <p className="mt-0.5 text-xs text-muted">
                          {p.transactionReference ? <>Txn <span className="font-mono">{p.transactionReference}</span> · </> : null}
                          {p.payerPhone && <>{p.payerPhone} · </>}
                          {p.paidAt ? `paid ${p.paidAt}` : "awaiting customer"}
                          {p.submittedAt && ` · submitted ${formatDateTime(p.submittedAt)}`}
                        </p>
                        {p.reviewedAt && <p className="mt-0.5 text-xs text-muted">Reviewed {formatDateTime(p.reviewedAt)}{p.reviewedByName ? ` by ${p.reviewedByName}` : ""}</p>}
                        {p.rejectionReason && <p className="mt-1 text-xs text-danger-600">Rejected: {p.rejectionReason}</p>}
                        {p.refundAmount !== null && <p className="mt-1 text-xs text-sage-700">Refunded {formatMoney(p.refundAmount, p.currency)}{p.refundReference ? ` (ref ${p.refundReference})` : ""}</p>}
                        {p.adminNotes && <p className="mt-1 text-xs text-muted">Note: {p.adminNotes}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <PaymentStatusBadge status={p.status} />
                        <PaymentActions payment={p} bookingTotal={b.totalAmount} onDone={onBooking} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Guests">
            <ul className="divide-y divide-line text-sm">
              {b.guests.map((g) => (
                <li key={g.id} className="flex justify-between py-2"><span>{g.fullName}{g.isLeadContact && <span className="ml-2 text-xs text-muted">(lead contact)</span>}</span><span className="text-muted capitalize">{g.guestType}</span></li>
              ))}
            </ul>
            {b.guests.length < b.totalGuests && <p className="mt-2 text-xs text-muted">{b.totalGuests - b.guests.length} guest name(s) not provided.</p>}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Customer">
            <p className="font-semibold">{b.customerName}</p>
            <div className="mt-3 space-y-2 text-sm">
              <a href={telHref(b.customerPhone)} className="flex items-center gap-2 hover:underline"><Phone className="size-4 text-forest-600" />{b.customerPhone}</a>
              <a href={whatsappHref(b.customerPhone, `Hello ${b.customerName}, this is Her Journey Tours about your booking ${b.reference}.`)} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline"><MessageCircle className="size-4 text-forest-600" />WhatsApp</a>
              <a href={`mailto:${b.customerEmail}?subject=Booking ${b.reference}`} className="flex items-center gap-2 break-all hover:underline"><Mail className="size-4 shrink-0 text-forest-600" />{b.customerEmail}</a>
            </div>
          </Panel>

          <Panel title="Price breakdown">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Adult × {b.adults}</dt><dd>{formatMoney(b.adultUnitPrice * b.adults, b.currency)}</dd></div>
              {b.children > 0 && <div className="flex justify-between"><dt className="text-muted">Child × {b.children}</dt><dd>{formatMoney(b.childUnitPrice * b.children, b.currency)}</dd></div>}
              {b.feesAmount > 0 && <div className="flex justify-between"><dt className="text-muted">Fees</dt><dd>{formatMoney(b.feesAmount, b.currency)}</dd></div>}
              {b.discountAmount > 0 && <div className="flex justify-between text-forest-700"><dt>Discount applied</dt><dd>{formatMoney(b.discountAmount, b.currency)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Total</dt><dd>{formatMoney(b.totalAmount, b.currency)}</dd></div>
            </dl>
          </Panel>

          <Panel title="Internal notes">
            <Textarea rows={4} value={notes ?? b.adminNotes ?? ""} onChange={(e) => setNotes(e.target.value)} disabled={!can("bookings:write")} placeholder="Visible to staff only" />
            {notes !== null && <Button size="sm" className="mt-3" loading={saveNotes.isPending} onClick={() => saveNotes.mutate()}>Save notes</Button>}
          </Panel>

          <Panel title="History">
            {b.history.length === 0 ? (
              <p className="text-sm text-muted">No staff actions yet.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
                {b.history.map((h) => (
                  <li key={h.id}>
                    <p className="font-medium">{ACTION_LABELS[h.action] ?? h.action}</p>
                    <p className="text-xs text-muted">{formatDateTime(h.createdAt)}{h.adminName ? ` · ${h.adminName}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel booking"
        footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep booking</Button><Button variant="danger" loading={cancel.isPending} disabled={!reason.trim()} onClick={() => cancel.mutate()}>Cancel booking</Button></>}
      >
        <p className="mb-4 text-sm text-muted">The {b.totalGuests} seat(s) will be released. If the customer has paid, record a refund on the payment afterwards.</p>
        <Field label="Reason" required error={fieldErrors(cancel.error).reason}>{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="mt-3"><FormError message={cancel.isError && !fieldErrors(cancel.error).reason ? errorMessage(cancel.error) : null} /></div>
      </Modal>

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Record a payment"
        footer={<><Button variant="secondary" onClick={() => setManualOpen(false)}>Cancel</Button><Button loading={record.isPending} onClick={() => record.mutate()}>Record payment</Button></>}
      >
        <p className="mb-4 text-sm text-muted">For payments received by phone, cash or bank transfer. The payment is recorded as submitted; verify it to confirm the booking.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method" required>
            {(p) => <Select {...p} value={manual.method} onChange={(e) => setManual({ ...manual, method: e.target.value as PaymentMethod })}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}</Select>}
          </Field>
          <Field label={`Amount (${b.currency})`} required error={recordErrors.amount}>{(p) => <Input {...p} type="number" min={0} value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} />}</Field>
          <Field label="Transaction reference" error={recordErrors.transactionReference}>{(p) => <Input {...p} value={manual.transactionReference} onChange={(e) => setManual({ ...manual, transactionReference: e.target.value })} />}</Field>
          <Field label="Payer phone" error={recordErrors.payerPhone}>{(p) => <Input {...p} value={manual.payerPhone} onChange={(e) => setManual({ ...manual, payerPhone: e.target.value })} />}</Field>
          <Field label="Paid on" required error={recordErrors.paidAt}>{(p) => <Input {...p} type="date" value={manual.paidAt} onChange={(e) => setManual({ ...manual, paidAt: e.target.value })} />}</Field>
          <Field label="Notes" error={recordErrors.notes} className="sm:col-span-2">{(p) => <Textarea {...p} rows={2} value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} />}</Field>
        </div>
        <div className="mt-3"><FormError message={record.isError && !Object.keys(recordErrors).length ? errorMessage(record.error) : null} /></div>
      </Modal>
    </>
  );
}
