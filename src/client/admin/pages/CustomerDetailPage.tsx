import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Mail, Phone } from "lucide-react";
import type { AdminCustomerDetailDTO } from "@shared/types";
import { PAYMENT_METHOD_LABELS } from "@shared/constants";
import { formatMoney } from "@shared/money";
import { formatDate, formatDateTime } from "@shared/time";
import { api, errorMessage, fieldErrors } from "@client/lib/api";
import { telHref } from "@client/lib/contact";
import { Button } from "@client/components/ui/Button";
import { Field, FormError, Textarea } from "@client/components/ui/Field";
import { BookingStatusBadge, PaymentStatusBadge } from "@client/components/ui/Badge";
import { Modal } from "@client/components/ui/Modal";
import { ErrorState } from "@client/components/ui/EmptyState";
import { PageLoader } from "@client/components/ui/Spinner";
import { useToast } from "@client/components/ui/Toast";
import { PageHeader, Panel, Td, Th } from "../components/PageHeader";
import { AccountStatus, SignInMethods } from "../components/SignInMethods";
import { useCan } from "../session";

const ACTION_LABELS: Record<string, string> = {
  "customer.disable": "Account disabled",
  "customer.enable": "Account re-enabled",
  "customer.google_linked": "Google sign-in linked",
  "customer.signup_google": "Signed up with Google",
};

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const can = useCan();
  const toast = useToast();
  const queryClient = useQueryClient();
  const key = ["admin", "customer", id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<AdminCustomerDetailDTO>(`/api/admin/customers/${id}`) });
  const [disableOpen, setDisableOpen] = useState(false);
  const [reason, setReason] = useState("");

  const onSaved = (data: AdminCustomerDetailDTO) => {
    queryClient.setQueryData(key, data);
    queryClient.invalidateQueries({ queryKey: ["admin", "customers"] });
  };
  const disable = useMutation({
    mutationFn: () => api.post<AdminCustomerDetailDTO>(`/api/admin/customers/${id}/disable`, { reason }),
    onSuccess: (data) => { onSaved(data); setDisableOpen(false); toast("Account disabled and signed out everywhere"); },
  });
  const enable = useMutation({
    mutationFn: () => api.post<AdminCustomerDetailDTO>(`/api/admin/customers/${id}/enable`),
    onSuccess: (data) => { onSaved(data); toast("Account re-enabled"); },
    onError: (e) => toast(errorMessage(e), "error"),
  });

  if (q.isPending) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const u = q.data;
  const canManage = can("customers:manage");

  return (
    <>
      <PageHeader
        back={{ to: "/admin/users", label: "All users" }}
        title={u.fullName}
        description={<span className="flex items-center gap-2"><AccountStatus disabledAt={u.disabledAt} /> Joined {formatDateTime(u.createdAt)}</span>}
        actions={
          canManage &&
          (u.disabledAt ? (
            <Button icon={<CheckCircle2 className="size-4" />} loading={enable.isPending} onClick={() => confirm(`Re-enable ${u.fullName}'s account?`) && enable.mutate()}>
              Enable account
            </Button>
          ) : (
            <Button variant="secondary" icon={<Ban className="size-4 text-danger-600" />} onClick={() => { disable.reset(); setReason(""); setDisableOpen(true); }}>
              Disable account
            </Button>
          ))
        }
      />

      {u.disabledAt && (
        <div className="mb-6 rounded-2xl bg-danger-50 p-4 text-sm text-danger-700 ring-1 ring-danger-600/20">
          Disabled on {formatDateTime(u.disabledAt)}{u.disabledReason ? `: ${u.disabledReason}` : ""}. This user cannot sign in by any method.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <Panel title="Profile">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-muted">Email</dt><dd><a href={`mailto:${u.email}`} className="flex items-center gap-2 break-all hover:underline"><Mail className="size-4 shrink-0 text-forest-600" />{u.email}</a></dd></div>
              <div><dt className="text-xs text-muted">Phone</dt><dd>{u.phone ? <a href={telHref(u.phone)} className="flex items-center gap-2 hover:underline"><Phone className="size-4 text-forest-600" />{u.phone}</a> : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Sign-in methods</dt><dd className="mt-1"><SignInMethods hasPassword={u.hasPassword} hasGoogle={u.hasGoogle} /></dd></div>
              <div><dt className="text-xs text-muted">Email verified</dt><dd>{u.emailVerified ? "Yes" : "No"}</dd></div>
              <div><dt className="text-xs text-muted">Last sign-in</dt><dd>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</dd></div>
            </dl>
          </Panel>
          <Panel title="History">
            {u.history.length === 0 ? (
              <p className="text-sm text-muted">No account events recorded yet.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
                {u.history.map((h) => (
                  <li key={h.id}>
                    <p className="font-medium">{ACTION_LABELS[h.action] ?? h.action}</p>
                    <p className="text-xs text-muted">{formatDateTime(h.createdAt)}{h.adminName ? ` · ${h.adminName}` : ""}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={`Bookings (${u.bookings.length})`} className="overflow-hidden [&>div:last-child]:p-0">
            {u.bookings.length === 0 ? (
              <p className="p-6 text-sm text-muted">No bookings made while signed in.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-ivory"><tr><Th>Reference</Th><Th>Tour</Th><Th>Guests</Th><Th>Total</Th><Th>Status</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {u.bookings.map((b) => (
                      <tr key={b.id}>
                        <Td><Link to={`/admin/bookings/${b.id}`} className="font-mono font-semibold text-forest-700 hover:underline">{b.reference}</Link></Td>
                        <Td><p className="max-w-56 truncate">{b.tourTitle}</p><p className="text-xs text-muted">{formatDate(b.departureDate)}</p></Td>
                        <Td>{b.totalGuests}</Td>
                        <Td className="whitespace-nowrap">{formatMoney(b.totalAmount, b.currency)}</Td>
                        <Td><BookingStatusBadge status={b.status} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={`Payments (${u.payments.length})`} className="overflow-hidden [&>div:last-child]:p-0">
            {u.payments.length === 0 ? (
              <p className="p-6 text-sm text-muted">No payments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-ivory"><tr><Th>Transaction</Th><Th>Booking</Th><Th>Amount</Th><Th>Submitted</Th><Th>Status</Th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {u.payments.map((p) => (
                      <tr key={p.id}>
                        <Td><p className="font-mono">{p.transactionReference ?? "—"}</p><p className="text-xs text-muted">{PAYMENT_METHOD_LABELS[p.method]}</p></Td>
                        <Td><Link to={`/admin/bookings/${p.bookingId}`} className="font-mono font-semibold text-forest-700 hover:underline">{p.bookingReference}</Link></Td>
                        <Td className="whitespace-nowrap">{formatMoney(p.amount, p.currency)}</Td>
                        <Td className="whitespace-nowrap">{p.submittedAt ? formatDateTime(p.submittedAt) : "—"}</Td>
                        <Td><PaymentStatusBadge status={p.status} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title={`Disable ${u.fullName}'s account`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={disable.isPending} disabled={!reason.trim()} onClick={() => disable.mutate()}>Disable account</Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-muted">They will be signed out everywhere and won't be able to sign in with a password or Google. Their bookings are not affected.</p>
        <Field label="Reason (staff only)" required error={fieldErrors(disable.error).reason}>
          {(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <div className="mt-3"><FormError message={disable.isError && !fieldErrors(disable.error).reason ? errorMessage(disable.error) : null} /></div>
      </Modal>
    </>
  );
}
