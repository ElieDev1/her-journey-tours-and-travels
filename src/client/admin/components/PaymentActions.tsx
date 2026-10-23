import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminBookingDetailDTO, PaymentDTO } from "@shared/types";
import { formatMoney, toMajor, toMinor } from "@shared/money";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Input, Textarea } from "@client/components/ui/Field";
import { Modal } from "@client/components/ui/Modal";
import { useToast } from "@client/components/ui/Toast";
import { useCan } from "../session";

type Action = "verify" | "reject" | "refund";

/** Verify / reject / refund buttons for one payment, each with a confirmation dialog. */
export function PaymentActions({ payment, bookingTotal, onDone }: { payment: PaymentDTO; bookingTotal?: number; onDone?: (booking: AdminBookingDetailDTO) => void }) {
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [refundRef, setRefundRef] = useState("");

  const run = useMutation({
    mutationFn: () => {
      const base = `/api/admin/payments/${payment.id}`;
      if (action === "verify") return api.post<{ message: string; booking: AdminBookingDetailDTO }>(`${base}/verify`, { notes: text || null });
      if (action === "reject") return api.post<{ message: string; booking: AdminBookingDetailDTO }>(`${base}/reject`, { reason: text });
      return api.post<{ message: string; booking: AdminBookingDetailDTO }>(`${base}/refund`, {
        amount: toMinor(Number(amount), payment.currency),
        refundReference: refundRef || null,
        notes: text || null,
      });
    },
    onSuccess: (res) => {
      toast(res.message);
      setAction(null);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.setQueryData(["admin", "booking", String(res.booking.id)], res.booking);
      onDone?.(res.booking);
    },
  });
  const errors = fieldErrors(run.error);
  const open = (a: Action) => {
    run.reset();
    setText("");
    setRefundRef("");
    setAmount(String(toMajor(payment.amount, payment.currency)));
    setAction(a);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {payment.status === "submitted" && can("payments:verify") && (
          <>
            <Button size="sm" onClick={() => open("verify")}>Verify</Button>
            <Button size="sm" variant="secondary" onClick={() => open("reject")}>Reject</Button>
          </>
        )}
        {payment.status === "verified" && can("payments:refund") && (
          <Button size="sm" variant="secondary" onClick={() => open("refund")}>Record refund</Button>
        )}
      </div>

      <Modal
        open={action !== null}
        onClose={() => setAction(null)}
        title={action === "verify" ? "Verify payment" : action === "reject" ? "Reject payment" : "Record refund"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
            <Button variant={action === "verify" ? "primary" : "danger"} loading={run.isPending} onClick={() => run.mutate()} disabled={action === "reject" && !text.trim()}>
              {action === "verify" ? "Mark as verified" : action === "reject" ? "Reject payment" : "Record refund"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-ivory p-4 text-sm">
            <div><dt className="text-xs text-muted">Amount</dt><dd className="font-semibold">{formatMoney(payment.amount, payment.currency)}</dd></div>
            <div><dt className="text-xs text-muted">Transaction ID</dt><dd className="font-mono font-semibold">{payment.transactionReference ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">Payer phone</dt><dd>{payment.payerPhone ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">Paid on</dt><dd>{payment.paidAt ?? "—"}</dd></div>
            {bookingTotal !== undefined && <div className="col-span-2"><dt className="text-xs text-muted">Booking total</dt><dd>{formatMoney(bookingTotal, payment.currency)}</dd></div>}
          </dl>
          {action === "verify" && (
            <p className="text-sm text-muted">
              Only verify after you have confirmed this transaction in your MoMo merchant account. If the verified total covers the booking, it will be confirmed automatically.
            </p>
          )}
          {action === "refund" && (
            <>
              <Field label={`Refund amount (${payment.currency})`} required error={errors.amount}>
                {(p) => <Input {...p} type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
              <Field label="Refund transaction reference" error={errors.refundReference}>
                {(p) => <Input {...p} value={refundRef} onChange={(e) => setRefundRef(e.target.value)} />}
              </Field>
            </>
          )}
          <Field label={action === "reject" ? "Reason (shown to the customer)" : "Internal notes"} required={action === "reject"} error={errors.reason ?? errors.notes}>
            {(p) => <Textarea {...p} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={action === "reject" ? "e.g. We could not find this transaction ID" : ""} />}
          </Field>
          <FormError message={run.isError && !Object.keys(errors).length ? errorMessage(run.error) : null} />
        </div>
      </Modal>
    </>
  );
}
